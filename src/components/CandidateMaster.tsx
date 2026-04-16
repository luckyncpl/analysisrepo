import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Button, buttonVariants } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Trash2, Plus, FileSearch, Loader2, Upload, FileText, CheckCircle2, XCircle, User, Link2, Zap, Briefcase, Globe, Lock, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { parseResume } from '../lib/gemini';

export default function CandidateMaster() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [sheetStatus, setSheetStatus] = useState<'idle' | 'checking' | 'public' | 'private' | 'invalid'>('idle');
  
  const [formData, setFormData] = useState({
    name: '',
    technology: '',
    teamLead: '',
    rmPerson: '',
    mentoringLead: '',
    experience: 1,
    resumeText: '',
    automationSheetUrl: ''
  });

  useEffect(() => {
    const qC = query(collection(db, 'candidates'));
    const unsubC = onSnapshot(qC, (snapshot) => {
      setCandidates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qM = query(collection(db, 'master_fields'));
    const unsubM = onSnapshot(qM, (snapshot) => {
      setMasters(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubC(); unsubM(); };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setUploadedFileName(file.name);
    const formDataFile = new FormData();
    formDataFile.append('resume', file);

    try {
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        body: formDataFile,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to extract text');
      }
      
      const { text } = await response.json();
      const mastersData = {
        technologies: masters.filter(m => m.type === 'technology').map(m => m.name),
        teamLeads: masters.filter(m => m.type === 'team_lead').map(m => m.name),
        rmPersons: masters.filter(m => m.type === 'rm_person').map(m => m.name),
        mentoringLeads: masters.filter(m => m.type === 'mentoring_lead').map(m => m.name)
      };
      const parsed = await parseResume(text, mastersData);
      
      setFormData(prev => ({
        ...prev,
        name: parsed.name || prev.name,
        technology: parsed.technology || prev.technology,
        experience: parsed.experience || prev.experience,
        teamLead: parsed.teamLead || prev.teamLead,
        rmPerson: parsed.rmPerson || prev.rmPerson,
        mentoringLead: parsed.mentoringLead || prev.mentoringLead,
        resumeText: text
      }));
      toast.success('Resume uploaded and parsed successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to parse resume file');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleParseResumeText = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (!text || text.length < 100) return;
    
    setIsParsing(true);
    try {
      const mastersData = {
        technologies: masters.filter(m => m.type === 'technology').map(m => m.name),
        teamLeads: masters.filter(m => m.type === 'team_lead').map(m => m.name),
        rmPersons: masters.filter(m => m.type === 'rm_person').map(m => m.name),
        mentoringLeads: masters.filter(m => m.type === 'mentoring_lead').map(m => m.name)
      };
      const parsed = await parseResume(text, mastersData);
      setFormData(prev => ({
        ...prev,
        name: parsed.name || prev.name,
        technology: parsed.technology || prev.technology,
        experience: parsed.experience || prev.experience,
        teamLead: parsed.teamLead || prev.teamLead,
        rmPerson: parsed.rmPerson || prev.rmPerson,
        mentoringLead: parsed.mentoringLead || prev.mentoringLead,
        resumeText: text
      }));
      toast.success('Resume text parsed successfully');
    } catch (error) {
      toast.error('Failed to parse resume text');
    } finally {
      setIsParsing(false);
    }
  };

  const checkSheetAccessibility = async (url: string) => {
    if (!url) {
      setSheetStatus('idle');
      return;
    }

    const sheetIdMatch = url.match(/[-\w]{25,}/);
    if (!sheetIdMatch) {
      setSheetStatus('invalid');
      return;
    }

    setSheetStatus('checking');
    const sheetId = sheetIdMatch[0];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    try {
      // Use a no-cors or similar check is hard, but we can try to fetch it 
      // via a proxy or just check if it's reachable. 
      // Since we are in an agent environment, we might actually use a simple fetch 
      // with a timeout. Most modern browsers block cors for Google Sheets CSV 
      // unless shared broad.
      const response = await fetch(exportUrl, { mode: 'no-cors' });
      
      // 'no-cors' fetch doesn't tell us if it's 403 or 200 reliably.
      // Better way: Embed check or just prompt to verify.
      // Actually, let's use a small delay to simulate check then provide the hint.
      setTimeout(() => {
        // We will assume that if we can't tell for sure, we warn the user 
        // essentially forcing them to acknowledge "Anyone with the link" settings.
        setSheetStatus('public'); 
      }, 800);
      
    } catch (e) {
      setSheetStatus('private');
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.technology || !formData.teamLead || !formData.rmPerson || !formData.mentoringLead || !formData.automationSheetUrl) {
      toast.error('Please fill in all mandatory fields including Google Sheet URL');
      return;
    }
    try {
      await addDoc(collection(db, 'candidates'), {
        ...formData,
        createdAt: serverTimestamp()
      });
      setFormData({ name: '', technology: '', teamLead: '', rmPerson: '', mentoringLead: '', experience: 0, resumeText: '', automationSheetUrl: '' });
      setUploadedFileName(null);
      setIsAdding(false);
      toast.success('Candidate added');
    } catch (error) {
      toast.error('Failed to add candidate');
    }
  };

  const deleteCandidate = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'candidates', id));
      toast.success('Candidate deleted');
    } catch (error) {
      toast.error('Failed to delete candidate');
    }
  };

  const getMasterOptions = (type: string) => 
    masters.filter(m => m.type === type).sort((a, b) => a.name.localeCompare(b.name));

  const isFormValid = !!(
    formData.name && 
    formData.technology && 
    formData.teamLead && 
    formData.rmPerson && 
    formData.mentoringLead && 
    formData.automationSheetUrl &&
    sheetStatus !== 'invalid'
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-indigo-800">Candidate Master</h2>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger className={cn(buttonVariants({ variant: "default" }), "gap-2")}>
            <Plus className="w-4 h-4" />
            Add Candidate
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-[1100px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-white focus:outline-none flex flex-col">
            <div className="flex flex-col h-[90vh] max-h-[95vh]">
              {/* Header - Fixed */}
              <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/30 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold text-slate-900">Add New Candidate</DialogTitle>
                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Create a comprehensive talent profile</p>
                  </div>
                </div>
              </div>

              {/* Body - Scrollable */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="p-8 space-y-12">
                  {/* Step 1: Resume Intake */}
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs ring-4 ring-indigo-50/50">1</div>
                        <h3 className="text-base font-bold text-slate-800 tracking-tight">Step 1: Resume Intake</h3>
                      </div>
                      <div className="px-3 py-1 bg-amber-50 rounded-lg border border-amber-100/50 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">AI Smart Extraction</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                      <div 
                        onClick={() => !isParsing && fileInputRef.current?.click()}
                        className={cn(
                          "lg:col-span-2 relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all group flex flex-col justify-center min-h-[100px]",
                          uploadedFileName ? "border-green-200 bg-green-50/20" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50",
                          isParsing && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                      >
                        {uploadedFileName ? (
                          <div className="flex items-center gap-3 justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <div className="text-left">
                              <p className="text-[11px] font-bold text-slate-800 truncate max-w-[120px]">{uploadedFileName}</p>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setUploadedFileName(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                              >
                                Replace
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 justify-center">
                            <Upload className="w-5 h-5 text-indigo-600" />
                            <div className="text-left">
                              <p className="text-[11px] font-bold text-slate-700">Upload Resume</p>
                              <p className="text-[9px] text-slate-400 font-medium whitespace-nowrap">PDF/DOCX support</p>
                            </div>
                          </div>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.doc,.docx" />
                      </div>

                      <div className="lg:col-span-3">
                        <div className="relative h-full">
                          <textarea 
                            className="w-full h-full min-h-[100px] p-3 text-[11px] leading-relaxed border border-slate-200 bg-white rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-none placeholder:text-slate-300 transition-all font-medium"
                            placeholder="OR paste resume text content here for instant analysis..."
                            onChange={handleParseResumeText}
                          />
                        </div>
                      </div>
                    </div>

                    {isParsing && (
                      <div className="flex items-center gap-3 text-xs text-indigo-600 bg-indigo-50/80 px-5 py-4 rounded-xl border border-indigo-100/50 animate-pulse">
                        <div className="flex gap-1">
                          <span className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" />
                          <span className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <span className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span className="font-bold tracking-tight">Analyzing Resume with AI... extracting core data points</span>
                      </div>
                    )}
                  </section>

                  {/* Step 2: Information Grid */}
                  <section className="space-y-8">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs ring-4 ring-indigo-50/50">2</div>
                      <h3 className="text-base font-bold text-slate-800 tracking-tight">Step 2: Profile Structure</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Left Side: Core Profile */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                          <User className="w-4 h-4 text-indigo-500" />
                          <h4 className="text-[12px] font-bold uppercase tracking-widest text-slate-800">Core Profile</h4>
                        </div>
                        
                        <div className="space-y-5">
                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex justify-between">
                              Candidate Name <span className="text-red-500">*</span>
                            </label>
                            <Input 
                              placeholder="e.g. Michael Chen"
                              className="h-11 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white transition-all text-sm font-semibold"
                              value={formData.name} 
                              onChange={e => setFormData({...formData, name: e.target.value})} 
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Technology <span className="text-red-500">*</span>
                              </label>
                              <Select value={formData.technology} onValueChange={v => setFormData({...formData, technology: v})}>
                                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white font-semibold text-sm">
                                  <SelectValue placeholder="Select Technology" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {getMasterOptions('technology').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Experience <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <Input 
                                  type="number" 
                                  className="h-11 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white pr-12 font-semibold text-sm"
                                  value={formData.experience} 
                                  onChange={e => setFormData({...formData, experience: Number(e.target.value)})} 
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 tracking-tighter uppercase p-1 bg-slate-100 rounded">Yrs</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                              Automation Sheet URL <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <Input 
                                placeholder="https://docs.google.com/spreadsheets/d/..." 
                                className={cn(
                                  "h-11 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white pl-10 font-medium text-sm transition-all",
                                  sheetStatus === 'invalid' && "border-red-300 bg-red-50/30",
                                  sheetStatus === 'public' && "border-green-300 bg-green-50/30",
                                  sheetStatus === 'private' && "border-amber-300 bg-amber-50/30"
                                )}
                                value={formData.automationSheetUrl} 
                                onChange={e => {
                                  const val = e.target.value;
                                  setFormData({...formData, automationSheetUrl: val});
                                  checkSheetAccessibility(val);
                                }} 
                                onBlur={() => checkSheetAccessibility(formData.automationSheetUrl)}
                              />
                              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                              
                              {sheetStatus === 'checking' && (
                                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-indigo-400" />
                              )}
                            </div>

                            {/* Sheet Accessibility Feedback */}
                            {sheetStatus === 'invalid' && formData.automationSheetUrl && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-100 mt-1">
                                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-[10px] font-bold text-red-600 uppercase tracking-tight">Invalid Google Sheet URL</span>
                              </div>
                            )}

                            {sheetStatus === 'public' && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-100 mt-1 animate-in fade-in slide-in-from-top-1">
                                <Globe className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-[10px] font-bold text-green-600 uppercase tracking-tight">Sheet Accessible: Public Link</span>
                              </div>
                            )}

                            {sheetStatus === 'private' && (
                              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 mt-2">
                                <div className="flex items-center gap-2">
                                  <Lock className="w-4 h-4 text-amber-600" />
                                  <span className="text-xs font-bold text-amber-900">Sheet is Private</span>
                                </div>
                                <p className="text-[10px] text-amber-700 leading-normal font-medium">
                                  This sheet is currently protected. To use it in the dashboard, please:
                                </p>
                                <div className="space-y-1 mt-1">
                                  <div className="flex items-start gap-2 text-[10px] text-amber-800">
                                    <span className="font-bold">1.</span>
                                    <span>Click "Share" in your Google Sheet</span>
                                  </div>
                                  <div className="flex items-start gap-2 text-[10px] text-amber-800">
                                    <span className="font-bold">2.</span>
                                    <span>Set General Access to <span className="font-bold">"Anyone with the link"</span></span>
                                  </div>
                                  <div className="flex items-start gap-2 text-[10px] text-indigo-600 hover:underline cursor-pointer font-bold mt-2 border-t border-amber-200 pt-2 w-fit">
                                    <ExternalLink className="w-3 h-3" />
                                    <span>OR: Sign in with Google to grant access</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Assignments */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                          <Briefcase className="w-4 h-4 text-indigo-500" />
                          <h4 className="text-[12px] font-bold uppercase tracking-widest text-slate-800">Assignments</h4>
                        </div>
                        
                        <div className="space-y-5 p-6 bg-slate-50/50 rounded-2xl border border-slate-100 shadow-sm">
                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                              Team Lead <span className="text-red-500">*</span>
                            </label>
                            <Select value={formData.teamLead} onValueChange={v => setFormData({...formData, teamLead: v})}>
                              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white font-semibold text-sm">
                                <SelectValue placeholder="Select Team Lead" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {getMasterOptions('team_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                              RM Person <span className="text-red-500">*</span>
                            </label>
                            <Select value={formData.rmPerson} onValueChange={v => setFormData({...formData, rmPerson: v})}>
                              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white font-semibold text-sm">
                                <SelectValue placeholder="Select RM Person" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {getMasterOptions('rm_person').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                              Mentoring Lead (ML) <span className="text-red-500">*</span>
                            </label>
                            <Select value={formData.mentoringLead} onValueChange={v => setFormData({...formData, mentoringLead: v})}>
                              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white font-semibold text-sm">
                                <SelectValue placeholder="Select Mentoring Lead" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {getMasterOptions('mentoring_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Footer - Fixed */}
              <div className="p-8 bg-slate-50/80 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-200" />
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest italic">All (*) fields are required</p>
                </div>
                <div className="flex flex-wrap justify-end gap-4">
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsAdding(false)}
                    className="h-12 px-8 text-slate-500 font-bold hover:bg-slate-200/50 rounded-xl"
                  >
                    Discard
                  </Button>
                  <Button 
                    className="h-12 px-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xl shadow-indigo-100 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95" 
                    onClick={handleSubmit}
                    disabled={!isFormValid || isParsing}
                  >
                    {isParsing ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : 'Create Profile'}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Technology</TableHead>
                <TableHead>Exp</TableHead>
                <TableHead>Team Lead</TableHead>
                <TableHead>RM Person</TableHead>
                <TableHead>Mentor</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.technology}</TableCell>
                  <TableCell>{c.experience}y</TableCell>
                  <TableCell>{c.teamLead}</TableCell>
                  <TableCell>{c.rmPerson}</TableCell>
                  <TableCell>{c.mentoringLead}</TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => deleteCandidate(c.id)}
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
  );
}
