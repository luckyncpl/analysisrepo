import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp, where, getDocs, updateDoc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Trash2, Play, RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { analyzeJobFit } from '../lib/gemini';
import { calculateJobFit } from '../lib/matchingEngine';
import { format } from 'date-fns';

export default function JobMonitor() {
  const [postings, setPostings] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const qP = query(collection(db, 'job_postings'));
    const unsubP = onSnapshot(qP, (snapshot) => {
      setPostings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    const qC = query(collection(db, 'candidates'));
    const unsubC = onSnapshot(qC, (snapshot) => {
      setCandidates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubP(); unsubC(); };
  }, []);

  const handleBulkPaste = async () => {
    if (!selectedCandidate) {
      toast.error('Please select a candidate first');
      return;
    }
    
    // Expected format: Role \t TinyURL \t Date \t Company \t Source
    const lines = bulkText.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    setIsProcessing(true);
    try {
      const newPostings: any[] = [];
      for (const line of lines) {
        const [role, tinyUrl, date, company, source] = line.split('\t');
        
        const docData = {
          candidateId: selectedCandidate,
          role: role?.trim() || 'Unknown Role',
          tinyUrl: tinyUrl?.trim() || '',
          date: date?.trim() || format(new Date(), 'yyyy-MM-dd'),
          company: company?.trim() || 'Unknown',
          source: source?.trim() || 'LinkedIn',
          status: 'pending_validation',
          createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'job_postings'), docData);
        newPostings.push({ id: docRef.id, ...docData });
      }
      
      setBulkText('');
      toast.success(`Imported ${lines.length} postings. Starting validation...`);

      // Process each new posting
      for (const posting of newPostings) {
        await validateAndProcess(posting);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to process postings');
    } finally {
      setIsProcessing(false);
    }
  };

  const validateAndProcess = async (posting: any) => {
    try {
      // 1. Basic Format Validation
      if (!posting.role || !posting.tinyUrl || posting.role === 'Unknown Role') {
        await updateDoc(doc(db, 'job_postings', posting.id), { 
          status: 'invalid_url',
          validationError: 'Missing Role or URL'
        });
        return;
      }

      // 2. URL Format Validation
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
      if (!urlPattern.test(posting.tinyUrl)) {
        await updateDoc(doc(db, 'job_postings', posting.id), { 
          status: 'invalid_url',
          validationError: 'Malformed URL'
        });
        return;
      }

      // 3. Mark as Ready
      await updateDoc(doc(db, 'job_postings', posting.id), { 
        status: 'ready_for_analysis' 
      });

      // 4. Trigger Analysis automatically
      await runAnalysis({ ...posting, status: 'ready_for_analysis' });

    } catch (error) {
      console.error(error);
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'failed' });
    }
  };

  const runAnalysis = async (posting: any) => {
    const candidate = candidates.find(c => c.id === posting.candidateId);
    if (!candidate) return;

    try {
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'analyzing' });

      // 1. Resolve URL with fallback
      const resolveRes = await fetch('/api/resolve-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: posting.tinyUrl })
      });
      
      if (!resolveRes.ok) {
        const errorData = await resolveRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to resolve URL');
      }

      const resolveData = await resolveRes.json();
      const finalUrl = resolveData.finalUrl || posting.tinyUrl;
      const resolveMethod = resolveData.method || 'unknown';

      // 2. Scrape Job with Stealth
      const scrapeRes = await fetch('/api/scrape-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl })
      });

      if (!scrapeRes.ok) {
        throw new Error('Failed to scrape job');
      }

      const { content, isEasyApply: isEasyApplyDetected } = await scrapeRes.json();

      // 3. AI Data Extraction
      const extractedData = await analyzeJobFit(content, candidate);
      
      // 4. Deterministic Matching Logic (Core Engine)
      const matchResult = calculateJobFit(
        extractedData.jdMinExp,
        candidate.experience, // Target Role Exp
        candidate.experience  // For now using same
      );

      // 5. Update Firestore
      await updateDoc(doc(db, 'job_postings', posting.id), {
        finalUrl,
        status: 'completed',
        resolveMethod,
        analysis: {
          ...extractedData,
          ...matchResult,
          isEasyApply: isEasyApplyDetected || extractedData.isEasyApplyMentioned
        }
      });

      toast.success(`Analysis complete for ${posting.role}`);
    } catch (error) {
      console.error(error);
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'failed' });
      toast.error(`Analysis failed for ${posting.role}`);
    }
  };

  const clearAll = async () => {
    // Using a more robust confirmation approach
    const confirmed = window.confirm('Are you sure you want to clear all postings? This action cannot be undone.');
    if (!confirmed) return;

    try {
      toast.loading('Clearing all postings...', { id: 'clear-all' });
      const snapshot = await getDocs(collection(db, 'job_postings'));
      
      if (snapshot.empty) {
        toast.dismiss('clear-all');
        toast.info('No postings to clear');
        return;
      }

      // Batch delete for better performance and reliability
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'job_postings', d.id)));
      await Promise.all(deletePromises);
      
      toast.success('All postings cleared successfully', { id: 'clear-all' });
    } catch (error) {
      console.error('Error clearing postings:', error);
      toast.error('Failed to clear postings. Please try again.', { id: 'clear-all' });
    }
  };

  const getCandidateName = (id: string) => candidates.find(c => c.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-indigo-800">Job Monitor</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearAll} className="text-red-600 hover:text-red-700">Clear All</Button>
          <Button variant="secondary" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Sync Google Sheets
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Ingestion Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Manual Ingestion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Candidate</label>
              <Select value={selectedCandidate} onValueChange={setSelectedCandidate}>
                <SelectTrigger><SelectValue placeholder="Select Candidate" /></SelectTrigger>
                <SelectContent>
                  {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bulk Paste (Role \t URL \t Date \t Co \t Src)</label>
              <textarea 
                className="w-full h-48 p-3 text-xs border rounded-md font-mono"
                placeholder="Paste rows from Google Sheet here..."
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleBulkPaste} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Validate & Analyze
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Monitoring Table */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">Recent Postings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Role / Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Analysis</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postings.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{getCandidateName(p.candidateId)}</TableCell>
                    <TableCell>
                      <div className="text-sm font-bold">{p.role}</div>
                      <div className="text-xs text-slate-500">{p.company} • {p.source}</div>
                      <a href={p.tinyUrl} target="_blank" className="text-[10px] text-blue-600 flex items-center gap-1 hover:underline">
                        <Link2 className="w-3 h-3" /> {p.tinyUrl}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={
                          p.status === 'completed' ? 'default' : 
                          p.status === 'failed' || p.status === 'invalid_url' ? 'destructive' : 
                          p.status === 'analyzing' ? 'outline' :
                          'secondary'
                        } className="capitalize">
                          {p.status === 'analyzing' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                          {p.status.replace(/_/g, ' ')}
                        </Badge>
                        {p.validationError && (
                          <div className="text-[10px] text-red-500 font-medium flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> {p.validationError}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.analysis ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {p.analysis.isEasyApply && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">EA</Badge>}
                            <Badge variant="outline" className={
                              p.analysis.isGoodFit ? "text-blue-600 border-blue-200 bg-blue-50" : 
                              p.analysis.status === 'EXP > Resume exp' ? "text-purple-600 border-purple-200 bg-purple-50" :
                              "text-orange-600 border-orange-200 bg-orange-50"
                            }>
                              {p.analysis.status || (p.analysis.isGoodFit ? 'Good Fit' : 'Not Fit')}
                            </Badge>
                            {p.analysis.scenario && p.analysis.scenario !== 'Standard' && (
                              <Badge variant="secondary" className="text-[9px] h-4">{p.analysis.scenario}</Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 max-w-[200px] leading-tight" title={p.analysis.reason || p.analysis.fitReason}>
                            {p.analysis.reason || p.analysis.fitReason}
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => runAnalysis(p)}>
                          Analyze Now
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => deleteDoc(doc(db, 'job_postings', p.id))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
