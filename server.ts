import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { chromium } from "playwright-core";
import multer from "multer";
import cron from "node-cron";
import { DateTime } from "luxon";
import { initializeApp as initializeFirebaseApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const stealth = require("playwright-stealth");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const Papa = require("papaparse");

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Initialize Firebase for server-side use
const firebaseApp = initializeFirebaseApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  const upload = multer({ storage: multer.memoryStorage() });

  // Helper for automated analysis
  const analyzeJobFitServer = async (content: string, candidate: any) => {
    const prompt = `
      Here is a raw job description scraped from a website. Meticulously scan it from top to bottom. 
      Extract every single requirement, skill, and responsibility into a structured JSON format. 
      Do not skip any lines.
      
      Candidate Profile:
      - Technology: ${candidate.technology}
      - Core Experience: ${candidate.experience} years
      - Resume Context: ${candidate.resumeText || "Not provided"}
      
      Scraped Job Description:
      ${content}
      
      Return a STRICT JSON object in this format:
      {
        "isGoodFit": boolean,
        "fitReason": "string (brief summary)",
        "jdMinExp": number (the minimum years of experience required by the JD),
        "isEasyApplyMentioned": boolean,
        "scenario": "Standard" | "High Exp" | "Low Exp",
        "extractedRequirements": {
          "skills": ["string"],
          "responsibilities": ["string"],
          "experience": "string"
        }
      }
    `;
    
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      return JSON.parse(result.text || "{}");
    } catch (e) {
      console.error("Gemini Analysis Error:", e);
      return { isGoodFit: false, fitReason: "Analysis failed", jdMinExp: 0, isEasyApplyMentioned: false, scenario: "Standard" };
    }
  };

  // Automation Logic
  const runAutomation = async () => {
    console.log(`[${DateTime.now().setZone('America/New_York').toString()}] Starting daily automation...`);
    
    try {
      // 1. Get all candidates with automation URLs
      const candidatesSnap = await getDocs(collection(db, 'candidates'));
      const candidates = candidatesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      const postingsSnap = await getDocs(collection(db, 'job_postings'));
      const existingPostings = postingsSnap.docs.map(d => d.data());

      for (const candidate of candidates) {
        if (!candidate.automationSheetUrl) continue;

        console.log(`Processing automation for candidate: ${candidate.name}`);
        
        // Extract sheet ID
        const sheetIdMatch = candidate.automationSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) continue;
        const sheetId = sheetIdMatch[1];
        
        const gidMatch = candidate.automationSheetUrl.match(/[#&]gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : '0';

        // Fetch sheet
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
        const response = await fetch(csvUrl);
        if (!response.ok) continue;
        const csvText = await response.text();

        // Parse
        const results = Papa.parse(csvText);
        const rows = results.data as string[][];
        if (rows.length === 0) continue;

        // Find header
        const expectedHeaders = ['ROLE NAME', 'JOB POST URL', 'DATE', 'COMPANY NAME', 'SOURCE'];
        let headerIndex = -1;
        let columnMapping: Record<string, number> = {};

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map(cell => cell?.toString().toUpperCase().trim());
          const foundHeaders = expectedHeaders.filter(h => row.includes(h));
          if (foundHeaders.length === 5) {
            headerIndex = i;
            expectedHeaders.forEach(h => columnMapping[h] = row.indexOf(h));
            break;
          }
        }

        if (headerIndex === -1) continue;

        // Import
        for (let i = headerIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const role = row[columnMapping['ROLE NAME']]?.toString().trim();
          const url = row[columnMapping['JOB POST URL']]?.toString().trim();
          const date = row[columnMapping['DATE']]?.toString().trim();
          const company = row[columnMapping['COMPANY NAME']]?.toString().trim();
          const source = row[columnMapping['SOURCE']]?.toString().trim();

          if (!role || !url) continue;

          // Duplicate check
          const isDuplicate = existingPostings.some((p: any) => 
            p.tinyUrl === url || (p.role === role && p.company === company && p.date === date)
          );
          if (isDuplicate) continue;

          // Save
          const docData = {
            candidateId: candidate.id,
            role,
            tinyUrl: url,
            date: date || DateTime.now().toISODate(),
            company: company || 'Unknown',
            source: source || 'LinkedIn',
            status: 'Synced',
            createdAt: serverTimestamp()
          };
          await addDoc(collection(db, 'job_postings'), docData);
          console.log(`Automated import: ${role} at ${company}`);
        }
      }

      // 2. Process all 'Synced' or 'Pending Validation' postings
      const pendingSnap = await getDocs(query(collection(db, 'job_postings'), where('status', 'in', ['Synced', 'Pending Validation'])));
      console.log(`Found ${pendingSnap.size} pending postings to process automatically`);
      
      for (const pDoc of pendingSnap.docs) {
        const posting = { id: pDoc.id, ...pDoc.data() } as any;
        const candidate = candidates.find(c => c.id === posting.candidateId);
        if (!candidate) continue;

        try {
          await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Validating' });
          
          // Basic URL validation
          const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
          if (!urlPattern.test(posting.tinyUrl)) {
            await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Invalid URL', validationError: 'Malformed URL' });
            continue;
          }

          await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Analyzing' });

          // Simplified resolution and scraping for automation
          // In a real scenario, we'd use the same logic as the API endpoints
          // For now, we'll just try to fetch the content directly or skip if it fails
          const scrapeRes = await fetch(`http://localhost:3000/api/scrape-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: posting.tinyUrl })
          });

          if (scrapeRes.ok) {
            const { content, isEasyApply } = await scrapeRes.json();
            const analysis = await analyzeJobFitServer(content, candidate);
            
            await updateDoc(doc(db, 'job_postings', posting.id), {
              status: 'Completed',
              analysis: {
                ...analysis,
                isEasyApply
              }
            });
          } else {
            await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Failed', validationError: 'Scraping failed' });
          }
        } catch (e) {
          console.error(`Failed to process posting ${posting.id}:`, e);
          await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Failed' });
        }
      }
      
      // Update metadata
      const metaSnap = await getDocs(query(collection(db, 'automation_metadata'), where('id', '==', 'last_run')));
      const metaData = {
        id: 'last_run',
        lastSync: new Date().toISOString(),
        lastAutomation: new Date().toISOString()
      };
      if (metaSnap.empty) {
        await addDoc(collection(db, 'automation_metadata'), metaData);
      } else {
        await updateDoc(doc(db, 'automation_metadata', metaSnap.docs[0].id), metaData);
      }

    } catch (error) {
      console.error("Automation error:", error);
    }
  };

  // Schedule for 10:30 PM EST
  // EST is America/New_York
  cron.schedule('30 22 * * *', () => {
    runAutomation();
  }, {
    timezone: "America/New_York"
  });

  app.use(express.json());

  // API: Parse Resume File
  app.post("/api/extract-text", upload.single('resume'), async (req, res) => {
    console.log("Received resume extraction request");
    if (!req.file) {
      console.error("No file uploaded in request");
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`File received: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

    try {
      let text = "";
      if (req.file.mimetype === "application/pdf") {
        console.log("Extracting text from PDF...");
        const data = await pdf(req.file.buffer);
        text = data.text;
        console.log(`PDF extraction successful. Length: ${text.length}`);
      } else if (
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        req.file.mimetype === "application/msword" ||
        req.file.originalname.endsWith('.docx') ||
        req.file.originalname.endsWith('.doc')
      ) {
        console.log("Extracting text from DOCX/DOC...");
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
        console.log(`DOCX extraction successful. Length: ${text.length}`);
      } else {
        console.error(`Unsupported mimetype: ${req.file.mimetype}`);
        return res.status(400).json({ error: "Unsupported file type. Please upload PDF or DOCX." });
      }

      if (!text || text.trim().length === 0) {
        console.warn("Extracted text is empty");
        return res.status(422).json({ error: "Could not extract any text from the file. The file might be empty or scanned as an image." });
      }

      res.json({ text });
    } catch (error) {
      console.error("Extraction error details:", error);
      res.status(500).json({ error: "Failed to extract text from resume. Please try pasting the text manually." });
    }
  });

  // API: Trigger Automation Manually
  app.post("/api/trigger-automation", async (req, res) => {
    try {
      runAutomation();
      res.json({ message: "Automation triggered successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to trigger automation" });
    }
  });

  // API: Fetch Google Sheet CSV (Server-side to bypass CORS)
  app.get("/api/fetch-sheet", async (req, res) => {
    const { sheetId, gid } = req.query;
    if (!sheetId) return res.status(400).json({ error: "sheetId is required" });

    try {
      let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
      if (gid) csvUrl += `&gid=${gid}`;

      console.log(`Fetching sheet data from: ${csvUrl}`);
      
      const response = await fetch(csvUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Google Sheets returned ${response.status}: ${response.statusText}`);
      }

      const csvText = await response.text();
      res.send(csvText);
    } catch (error) {
      console.error("Sheet fetch error:", error);
      res.status(500).json({ error: "Failed to fetch sheet data. Ensure the sheet is shared as 'Anyone with the link can view'." });
    }
  });

  // API: Resolve TinyURL with Fallback
  app.post("/api/resolve-url", async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Normalize URL
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      // Layer 1: Fast HTTP Resolution
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { 
        method: 'GET', 
        redirect: 'follow',
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return res.json({ finalUrl: response.url, method: 'fast' });
      }
    } catch (error) {
      console.log(`Fast resolution failed for ${url}:`, error instanceof Error ? error.message : error);
    }

    // Layer 2: Browser Fallback (Stealth)
    let browser;
    try {
      browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      await stealth(page); // Apply stealth
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const finalUrl = page.url();
      res.json({ finalUrl, method: 'browser' });
    } catch (error) {
      console.error(`Browser resolution failed for ${url}:`, error);
      res.status(500).json({ error: "Could not reach or resolve the job URL. Please check if the link is valid." });
    } finally {
      if (browser) await browser.close();
    }
  });

  // API: Scrape Job Description with Stealth and Platform-Specific Logic
  app.post("/api/scrape-job", async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Normalize URL
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    let browser;
    try {
      browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      await stealth(page); // Apply stealth to bypass bots detection

      console.log(`Navigating to for scraping: ${url}`);
      
      // Go to URL and wait for meaningful content
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Additional wait for specific job elements if needed
      await page.waitForTimeout(2000); 

      // Platform-specific JD selectors
      const extraction = await page.evaluate(() => {
        const currentUrl = window.location.href.toLowerCase();
        let jdSelector = "";
        let eaSelector = "";

        if (currentUrl.includes('linkedin.com')) {
          jdSelector = ".jobs-description__container, .jobs-box__html-content, #job-details, .jobs-description";
          eaSelector = "button.jobs-apply-button--top-card, .jobs-apply-button";
        } else if (currentUrl.includes('indeed.com')) {
          jdSelector = "#jobDescriptionText, .jobsearch-jobDescriptionText";
          eaSelector = "button#indeedApplyButton, .ia-IndeedApplyButton, #applyButton";
        } else if (currentUrl.includes('glassdoor.com')) {
          jdSelector = "[data-test='jobDescription'], .jobDescriptionContent";
          eaSelector = "button[data-test='easy-apply-button'], .easyApply";
        } else {
          // Generic fallback for any job site
          jdSelector = "article, main, .description, .job-description, #job-details, .jobsearch-JobComponent-description";
        }

        const jdElement = jdSelector ? document.querySelector(jdSelector) : null;
        let content = jdElement ? (jdElement as HTMLElement).innerText : "";
        
        // If content is still empty, grab everything useful
        if (!content || content.length < 100) {
          const main = document.querySelector('main') || document.body;
          content = (main as HTMLElement).innerText;
        }
        
        // Scrub common noise if needed, but the AI prompt asks for top-to-bottom scan
        
        let isEasyApply = false;
        if (eaSelector) {
          const eaBtn = document.querySelector(eaSelector);
          if (eaBtn) {
            const text = (eaBtn as HTMLElement).innerText.toLowerCase();
            isEasyApply = text.includes('easy apply') || text.includes('apply now') || text.includes('apply');
          }
        }
        
        // Final fallback for EA
        if (!isEasyApply) {
          const allButtons = Array.from(document.querySelectorAll('button, a'));
          isEasyApply = allButtons.some(b => {
             const t = (b as HTMLElement).innerText.toLowerCase();
             return (t.includes('easy apply') || t.includes('quick apply')) && !t.includes('company site');
          });
        }

        return { content, isEasyApply };
      });

      if (!extraction.content || extraction.content.length < 50) {
        throw new Error("Scraped content is too short or empty. Protection might be active.");
      }

      res.json(extraction);
    } catch (error) {
      console.error("Scrape error details:", error);
      res.status(500).json({ error: "Failed to scrape job description properly. The site might be blocking the request." });
    } finally {
      if (browser) await browser.close();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
