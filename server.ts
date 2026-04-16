import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { chromium } from "playwright-core";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import mammoth from "mammoth";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());

  // API: Parse Resume File
  app.post("/api/extract-text", upload.single('resume'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      let text = "";
      if (req.file.mimetype === "application/pdf") {
        const data = await pdf(req.file.buffer);
        text = data.text;
      } else if (
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        req.file.mimetype === "application/msword"
      ) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
      } else {
        return res.status(400).json({ error: "Unsupported file type. Please upload PDF or DOCX." });
      }

      res.json({ text });
    } catch (error) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: "Failed to extract text from resume" });
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

    // Layer 2: Browser Fallback
    let browser;
    try {
      browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // Set realistic headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Platform-specific JD selectors
      const extraction = await page.evaluate(() => {
        const url = window.location.href.toLowerCase();
        let jdSelector = "";
        let eaSelector = "";

        if (url.includes('linkedin.com')) {
          jdSelector = ".jobs-description__container, .jobs-box__html-content";
          eaSelector = "button.jobs-apply-button--top-card";
        } else if (url.includes('indeed.com')) {
          jdSelector = "#jobDescriptionText";
          eaSelector = "button#indeedApplyButton, .ia-IndeedApplyButton";
        } else if (url.includes('glassdoor.com')) {
          jdSelector = "[data-test='jobDescription']";
          eaSelector = "button[data-test='easy-apply-button']";
        } else {
          // Generic fallback
          jdSelector = "article, main, .description, .job-description, #job-details";
        }

        const jdElement = jdSelector ? document.querySelector(jdSelector) : null;
        const content = jdElement ? (jdElement as HTMLElement).innerText : document.body.innerText;
        
        let isEasyApply = false;
        if (eaSelector) {
          const eaBtn = document.querySelector(eaSelector);
          if (eaBtn) {
            const text = (eaBtn as HTMLElement).innerText.toLowerCase();
            isEasyApply = text.includes('easy apply') || text.includes('apply now');
          }
        } else {
          // Text-based fallback for EA
          const bodyText = document.body.innerText.toLowerCase();
          isEasyApply = bodyText.includes('easy apply') && !bodyText.includes('apply on company site');
        }

        return { content, isEasyApply };
      });

      res.json(extraction);
    } catch (error) {
      console.error("Scrape error:", error);
      res.status(500).json({ error: "Failed to scrape job" });
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
