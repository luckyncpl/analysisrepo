import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp, where, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { Button, buttonVariants } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { cn } from '../lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from './ui/dialog';
import { 
  Trash2, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Link2, 
  FileSpreadsheet,
  Plus,
  User,
  Search,
  ExternalLink,
  Table as TableIcon,
  LayoutGrid,
  Zap,
  Calendar,
  Building2,
  MoreVertical,
  ClipboardPaste,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { analyzeJobFit } from '../lib/gemini';
import { calculateJobFit } from '../lib/matchingEngine';
import { format } from 'date-fns';
import GoogleSheetsSync from './GoogleSheetsSync';

export default function JobMonitor() {
  const [postings, setPostings] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [automationStats, setAutomationStats] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const qP = query(collection(db, 'job_postings'));
    const unsubP = onSnapshot(qP, (snapshot) => {
      setPostings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    const qC = query(collection(db, 'candidates'));
    const unsubC = onSnapshot(qC, (snapshot) => {
      setCandidates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qA = query(collection(db, 'automation_metadata'), where('id', '==', 'last_run'));
    const unsubA = onSnapshot(qA, (snapshot) => {
      if (!snapshot.empty) {
        setAutomationStats(snapshot.docs[0].data());
      }
    });

    return () => { unsubP(); unsubC(); unsubA(); };
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
      for (const line of lines) {
        const [role, tinyUrl, date, company, source] = line.split('\t');
        
        const docData = {
          candidateId: selectedCandidate,
          role: role?.trim() || 'Unknown Role',
          tinyUrl: tinyUrl?.trim() || '',
          date: date?.trim() || format(new Date(), 'yyyy-MM-dd'),
          company: company?.trim() || 'Unknown',
          source: source?.trim() || 'LinkedIn',
          status: 'Pending Validation',
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, 'job_postings'), docData);
      }
      
      setBulkText('');
      toast.success(`Imported ${lines.length} postings. Click 'Validate & Analyze' to process.`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to process postings');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualProcess = async () => {
    const pendingPostings = postings.filter(p => p.status === 'Synced' || p.status === 'Pending Validation');
    if (pendingPostings.length === 0) {
      toast.info('No pending postings to process');
      return;
    }

    setIsProcessing(true);
    toast.loading(`Processing ${pendingPostings.length} postings...`, { id: 'process-postings' });
    
    try {
      for (const posting of pendingPostings) {
        await validateAndProcess(posting);
      }
      toast.success('Processing complete', { id: 'process-postings' });
    } catch (error) {
      console.error(error);
      toast.error('Processing encountered errors', { id: 'process-postings' });
    } finally {
      setIsProcessing(false);
    }
  };

  const validateAndProcess = async (posting: any) => {
    try {
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Validating' });

      // 1. Basic Format Validation
      if (!posting.role || !posting.tinyUrl || posting.role === 'Unknown Role') {
        await updateDoc(doc(db, 'job_postings', posting.id), { 
          status: 'Invalid URL',
          validationError: 'Missing Role or URL'
        });
        return;
      }

      // 2. URL Format Validation
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
      if (!urlPattern.test(posting.tinyUrl)) {
        await updateDoc(doc(db, 'job_postings', posting.id), { 
          status: 'Invalid URL',
          validationError: 'Malformed URL'
        });
        return;
      }

      // 3. Mark as Ready
      await updateDoc(doc(db, 'job_postings', posting.id), { 
        status: 'Ready for Analysis' 
      });

      // 4. Trigger Analysis
      await runAnalysis({ ...posting, status: 'Ready for Analysis' });

    } catch (error) {
      console.error(error);
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Failed' });
    }
  };

  const runAnalysis = async (posting: any) => {
    const candidate = candidates.find(c => c.id === posting.candidateId);
    if (!candidate) return;

    try {
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Analyzing' });

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
        status: 'Completed',
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
      await updateDoc(doc(db, 'job_postings', posting.id), { status: 'Failed' });
      toast.error(`Analysis failed for ${posting.role}`);
    }
  };

  const handleSyncComplete = async (newPostingsData: any[]) => {
    setIsProcessing(true);
    try {
      for (const data of newPostingsData) {
        const docData = {
          ...data,
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'job_postings'), docData);
      }
      
      setIsSyncModalOpen(false);
      toast.success(`Synced ${newPostingsData.length} postings. Click 'Validate & Analyze' to process.`);
    } catch (error) {
      console.error('Error saving synced postings:', error);
      toast.error('Failed to save synced postings');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = async () => {
    setIsClearingAll(true);
    const toastId = 'clear-all';
    try {
      toast.loading('Clearing all postings...', { id: toastId });
      const snapshot = await getDocs(collection(db, 'job_postings'));
      
      if (snapshot.empty) {
        toast.info('No postings to clear', { id: toastId });
        setIsClearAllOpen(false);
        return;
      }

      const BATCH_SIZE = 500;
      const docChunks = [];
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        docChunks.push(docs.slice(i, i + BATCH_SIZE));
      }

      for (const chunk of docChunks) {
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      
      toast.success('All postings cleared successfully', { id: toastId });
      setIsClearAllOpen(false);
    } catch (error) {
      console.error('Error clearing postings:', error);
      toast.error('Failed to clear postings', { id: toastId });
    } finally {
      setIsClearingAll(false);
    }
  };

  const getCandidateName = (id: string) => candidates.find(c => c.id === id)?.name || 'Unknown';

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(postings.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    setIsBulkDeleting(true);
    const toastId = toast.loading(`Deleting ${selectedIds.length} job postings...`);

    try {
      // Firestore batches have a limit of 500 operations
      const BATCH_SIZE = 500;
      const chunks = [];
      for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
        chunks.push(selectedIds.slice(i, i + BATCH_SIZE));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => {
          batch.delete(doc(db, 'job_postings', id));
        });
        await batch.commit();
      }
      
      // Clean up selection state
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      toast.success('Successfully deleted ' + selectedIds.length + ' postings', { id: toastId });
    } catch (error) {
      console.error('Error in bulk delete:', error);
      toast.error('Failed to complete bulk deletion. Check your permissions.', { id: toastId });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const filteredCandidates = candidates.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.technology?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = postings.filter(p => p.status === 'Synced' || p.status === 'Pending Validation' || p.status === 'Ready for Analysis').length;

  return (
    <div className="space-y-8 pb-32">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Job Monitor</h2>
          <div className="flex items-center gap-4 mt-2">
            {automationStats && (
              <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md border border-slate-200/50">
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  <span>Sync: {automationStats.lastSync ? format(new Date(automationStats.lastSync), 'MMM d, HH:mm') : 'Never'}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100/50">
                  <Zap className="w-3 h-3 fill-indigo-600" />
                  <span>Auto: {automationStats.lastAutomation ? format(new Date(automationStats.lastAutomation), 'MMM d, HH:mm') : 'Never'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedIds.length > 0 && (
            <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
              <DialogTrigger className={cn(buttonVariants({ variant: "destructive" }), "h-11 rounded-xl gap-2 shadow-lg shadow-red-100 animate-in zoom-in-95")}>
                <Trash2 className="w-4 h-4" />
                Delete {selectedIds.length}
              </DialogTrigger>
              <DialogContent className="rounded-3xl border-none shadow-2xl">
                <DialogHeader className="space-y-3">
                  <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-2">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <DialogTitle className="text-xl font-bold">Confirm Bulk Deletion</DialogTitle>
                  <DialogDescription className="text-slate-500 font-medium">
                    Are you sure you want to permanently delete <span className="text-red-600 font-bold">{selectedIds.length}</span> job postings? 
                    This action is irreversible.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-3 sm:gap-0 mt-4">
                  <Button variant="ghost" onClick={() => setIsBulkDeleteOpen(false)} disabled={isBulkDeleting} className="rounded-xl h-12 font-bold">
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting} className="rounded-xl h-12 px-8 font-bold shadow-lg shadow-red-100">
                    {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete Forever
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          
          <Dialog open={isClearAllOpen} onOpenChange={setIsClearAllOpen}>
            <DialogTrigger className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-6 rounded-xl text-slate-500 font-bold hover:bg-red-50 hover:text-red-600 transition-all")}>
              Clear All
            </DialogTrigger>
            <DialogContent className="rounded-3xl border-none shadow-2xl">
              <DialogHeader className="space-y-3">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-2">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <DialogTitle className="text-xl font-bold">Clear All Postings?</DialogTitle>
                <DialogDescription className="text-slate-500 font-medium">
                  This will remove <span className="text-red-600 font-bold">{postings.length}</span> entries from your pipeline. 
                  This action is permanent and helpful for starting fresh.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-3 sm:gap-0 mt-4">
                <Button variant="ghost" onClick={() => setIsClearAllOpen(false)} disabled={isClearingAll} className="rounded-xl h-12 font-bold">
                  Keep them
                </Button>
                <Button variant="destructive" onClick={handleClearAll} disabled={isClearingAll} className="rounded-xl h-12 px-8 font-bold shadow-lg shadow-red-100">
                  {isClearingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Clear Pipeline
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button 
            variant="outline" 
            className="h-11 px-6 rounded-xl gap-2 border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 transition-all shadow-sm"
            onClick={() => setIsSyncModalOpen(true)}
          >
            <RefreshCw className="w-4 h-4" />
            Sync Sheet
          </Button>

          <Button 
            className="h-11 px-8 rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-xl shadow-indigo-100 active:scale-95 disabled:opacity-50"
            onClick={handleManualProcess}
            disabled={isProcessing || postings.length === 0}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
            Validate & Analyze
          </Button>
        </div>
      </div>

      <GoogleSheetsSync 
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        candidates={candidates}
        existingPostings={postings}
        onSyncComplete={handleSyncComplete}
      />

      {/* Main Structured Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Panel: Configuration & Input */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="px-8 pt-8 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">Pipeline Config</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-0 space-y-10">
              
              {/* Step 1: Candidate Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 ring-4 ring-slate-50">1</div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Select Talent Profile</label>
                  </div>
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input 
                    placeholder="Search candidate..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 rounded-lg border-slate-100 bg-slate-50/50 text-xs pl-9 focus:bg-white transition-all"
                  />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredCandidates.map(candidate => (
                    <div 
                      key={candidate.id}
                      onClick={() => setSelectedCandidate(candidate.id)}
                      className={cn(
                        "group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all border outline-none",
                        selectedCandidate === candidate.id 
                          ? "bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500/10 shadow-sm" 
                          : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-100"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-all",
                        selectedCandidate === candidate.id 
                          ? "bg-indigo-600 text-white" 
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                      )}>
                        {candidate.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-bold truncate",
                          selectedCandidate === candidate.id ? "text-indigo-900" : "text-slate-700"
                        )}>{candidate.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{candidate.technology || 'General'}</p>
                      </div>
                      {selectedCandidate === candidate.id && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 animate-in zoom-in-95" />
                      )}
                    </div>
                  ))}
                  {filteredCandidates.length === 0 && (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">No candidates found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Job Ingestion */}
              <div className="space-y-4 pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 ring-4 ring-slate-50">2</div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Job Data Ingestion</label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Dialog open={isPasteModalOpen} onOpenChange={setIsPasteModalOpen}>
                    <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl gap-2 border-slate-100 bg-slate-50/50 hover:bg-white hover:border-indigo-400 transition-all text-[11px] font-bold text-slate-600")}>
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      Bulk Paste
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
                      <div className="p-8 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                            <ClipboardPaste className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-900">Bulk Ingestion</h3>
                            <p className="text-xs text-slate-500 font-medium">Paste rows directly from your tracking sheet</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Expected Tab-Separated Format
                            </p>
                            <code className="text-[10px] font-mono text-indigo-600 leading-none">
                              Role [TAB] URL [TAB] Date [TAB] Company [TAB] Source
                            </code>
                          </div>

                          <textarea 
                            className="w-full h-64 p-5 text-sm font-medium border border-slate-100 bg-white rounded-2xl shadow-inner focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-none placeholder:text-slate-300 transition-all"
                            placeholder="Paste your Excel/Google Sheet rows here..."
                            value={bulkText}
                            onChange={e => setBulkText(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="px-8 py-5 bg-slate-50 flex items-center justify-between gap-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase italic">
                          {bulkText.split('\n').filter(l => l.trim()).length} lines detected
                        </p>
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => setIsPasteModalOpen(false)} className="rounded-xl font-bold">Cancel</Button>
                          <Button 
                            className="rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-100"
                            onClick={() => {
                              handleBulkPaste();
                              setIsPasteModalOpen(false);
                            }}
                            disabled={!bulkText || !selectedCandidate}
                          >
                            Import Rows
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Button variant="outline" className="h-10 rounded-xl gap-2 border-slate-100 bg-slate-50/50 hover:bg-white hover:border-indigo-400 transition-all text-[11px] font-bold text-slate-600">
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </Button>
                </div>
                
                <p className="text-[10px] text-center text-slate-400 font-medium px-4">
                  Select a candidate above then paste rows from Google Sheet or add manually.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Integration Status (Mini Stats) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 bg-white rounded-3xl shadow-sm border border-slate-50 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pipeline Strength</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-black text-slate-900">{postings.length}</span>
                <span className="text-[10px] font-bold text-green-500 mb-1.5 uppercase">Active</span>
              </div>
            </div>
            <div className="p-5 bg-white rounded-3xl shadow-sm border border-slate-50 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Sync</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-black text-amber-500">{pendingCount}</span>
                <span className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Jobs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Recent Postings Table */}
        <div className="lg:col-span-8">
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="px-8 py-6 border-b border-slate-50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
                  <TableIcon className="w-4 h-4" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">Live Postings Pipeline</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <span className="px-2 py-0.5 bg-slate-50 rounded-md border border-slate-100">{postings.length} Total</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-100">
                      <TableHead className="w-[50px] pl-8">
                        <Checkbox 
                          checked={postings.length > 0 && selectedIds.length === postings.length}
                          onCheckedChange={(checked) => handleSelectAll(!!checked)}
                          className="rounded-md border-slate-300 data-[state=checked]:bg-indigo-600"
                        />
                      </TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-400 h-14">Status</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-400 h-14">Opportunity Details</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-400 h-14 text-right pr-8">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-64 text-center">
                          <div className="flex flex-col items-center justify-center gap-3 grayscale opacity-40">
                            <TableIcon className="w-12 h-12 text-slate-300" />
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No active postings in view</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      postings.map((p) => (
                        <TableRow key={p.id} className="hover:bg-slate-50/80 transition-all group border-b border-slate-50">
                          <TableCell className="pl-8">
                            <Checkbox 
                              checked={selectedIds.includes(p.id)}
                              onCheckedChange={() => toggleSelect(p.id)}
                              className="rounded-md border-slate-300 data-[state=checked]:bg-indigo-600"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1.5 min-w-[120px]">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "w-fit px-2.5 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-tight",
                                  p.status === 'Completed' ? "bg-green-50 text-green-600 border-green-100" : 
                                  p.status === 'Failed' || p.status === 'Invalid URL' ? "bg-red-50 text-red-600 border-red-100" : 
                                  p.status === 'Analyzing' || p.status === 'Validating' ? "bg-indigo-50 text-indigo-600 border-indigo-100 animate-pulse" :
                                  "bg-slate-50 text-slate-500 border-slate-100"
                                )}
                              >
                                {p.status}
                              </Badge>
                              {p.validationError && (
                                <div className="text-[9px] text-red-500 font-bold flex items-center gap-1 ml-1">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  <span>{p.validationError}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="py-2 space-y-2">
                              {/* Primary Row Info */}
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">
                                  {p.role}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="w-3 h-3 text-slate-300" />
                                    <span className="font-bold text-slate-700">{p.company}</span>
                                  </div>
                                  <span className="text-slate-200">|</span>
                                  <div className="flex items-center gap-1.5">
                                    <Zap className="w-3 h-3 text-amber-400" />
                                    <span>{p.source}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Secondary Row Tools (Analysis results) */}
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                                  <Calendar className="w-3 h-3" />
                                  <span>{p.date}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                                  <User className="w-3 h-3" />
                                  <span className="text-indigo-600/60 uppercase">{getCandidateName(p.candidateId)}</span>
                                </div>
                                
                                {p.analysis ? (
                                  <div className="flex flex-wrap gap-1.5 bg-slate-50/50 p-1 rounded-lg ring-1 ring-slate-100 ml-2 animate-in fade-in zoom-in-95">
                                    {p.analysis.isEasyApply && (
                                      <Badge className="bg-green-500 text-white border-none rounded-md text-[8px] h-4 font-black">EZ APPLY</Badge>
                                    )}
                                    <Badge className={cn(
                                      "text-[8px] h-4 font-black border-none rounded-md uppercase",
                                      p.analysis.isGoodFit ? "bg-indigo-600 text-white" : 
                                      p.analysis.status === 'EXP > Resume exp' ? "bg-purple-600 text-white" :
                                      "bg-amber-500 text-white"
                                    )}>
                                      {p.analysis.status || (p.analysis.isGoodFit ? 'MATCH' : 'MISMATCH')}
                                    </Badge>
                                    {p.analysis.fitScore && (
                                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 rounded-md flex items-center">
                                        {p.analysis.fitScore}%
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group/btn cursor-pointer" onClick={() => runAnalysis(p)}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover/btn:bg-indigo-500 transition-colors" />
                                    <span className="text-[10px] font-bold text-slate-400 group-hover/btn:text-indigo-600 transition-colors uppercase tracking-widest leading-none">Not Analyzed</span>
                                  </div>
                                )}
                              </div>

                              <a 
                                href={p.tinyUrl} 
                                target="_blank" 
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 hover:underline decoration-bold decoration-indigo-200"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {p.tinyUrl.length > 50 ? `${p.tinyUrl.substring(0, 50)}...` : p.tinyUrl}
                              </a>
                            </div>
                          </TableCell>
                          <TableCell className="pr-8 text-right">
                            <div className="flex justify-end items-center gap-1 opacity-10 md:opacity-0 group-hover:opacity-100 transition-all">
                              {p.analysis ? (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg"
                                  title="View Analysis Detail"
                                  onClick={() => toast.info(`Analysis: ${p.analysis.reason || 'Processing...'}`)}
                                >
                                  <Search className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-green-600 hover:bg-white rounded-lg"
                                  title="Validate Row"
                                  onClick={() => validateAndProcess(p)}
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg"
                                title="Delete Posting"
                                onClick={() => deleteDoc(doc(db, 'job_postings', p.id))}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Persistent Batch Process Footer */}
      {(pendingCount > 0 || postings.length > 0) && (
        <div className="fixed bottom-8 left-[300px] right-32 z-40 animate-in slide-in-from-bottom-10 fade-in duration-500">
          <Card className="bg-slate-900 border-none shadow-2xl rounded-3xl overflow-hidden ring-4 ring-white shadow-indigo-200/50">
            <div className="px-8 py-5 flex items-center justify-between gap-10">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
                    <Play className="w-5 h-5 fill-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold leading-tight">Ready to Analyze?</h4>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Automated Intelligence Pipeline</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-8">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Batch</span>
                    <span className="text-lg font-black text-white leading-tight">{pendingCount} <small className="text-[10px] text-slate-500">JOBS</small></span>
                  </div>
                  
                  {selectedCandidate && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Target Talent</span>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-sm font-bold text-indigo-400 truncate max-w-[120px]">{getCandidateName(selectedCandidate)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <p className="text-[11px] text-slate-400 font-medium text-right max-w-[200px] leading-tight">
                  Start the analysis engine to validate job descriptions and calculate talent-fit scores.
                </p>
                <Button 
                  onClick={handleManualProcess}
                  disabled={isProcessing || pendingCount === 0}
                  className="h-14 px-10 rounded-2xl bg-white hover:bg-indigo-50 text-indigo-900 font-extrabold shadow-xl shadow-slate-950/20 transition-all hover:scale-105 active:scale-95 gap-3 group"
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Start Batch Analysis</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
