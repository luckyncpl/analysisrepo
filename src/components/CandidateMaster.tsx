import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Trash2, Plus, FileSearch, Loader2, Upload, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { parseResume } from '../lib/gemini';

export default function CandidateMaster() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    technology: '',
    teamLead: '',
    rmPerson: '',
    mentoringLead: '',
    experience: 0,
    resumeText: ''
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

  const handleSubmit = async () => {
    if (!formData.name || !formData.technology || !formData.teamLead || !formData.rmPerson || !formData.mentoringLead) {
      toast.error('Please fill in all mandatory fields (Name, Tech, Team Lead, RM, Mentor)');
      return;
    }
    try {
      await addDoc(collection(db, 'candidates'), {
        ...formData,
        createdAt: serverTimestamp()
      });
      setFormData({ name: '', technology: '', teamLead: '', rmPerson: '', mentoringLead: '', experience: 0, resumeText: '' });
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

  const isFormValid = !!(formData.name && formData.technology && formData.teamLead && formData.rmPerson && formData.mentoringLead);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-indigo-800">Candidate Master</h2>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="w-4 h-4" />
            Add Candidate
          </DialogTrigger>
          <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
            <div className="flex flex-col h-full max-h-[90vh]">
              <div className="flex-1 overflow-y-auto p-8 space-y-10">
                {/* Step 1: Resume Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-200">1</div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Source Resume</h3>
                      <p className="text-xs text-slate-500">Upload or paste resume to auto-fill details</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all group h-full flex flex-col justify-center
                        ${uploadedFileName ? 'border-green-200 bg-green-50/30' : 'border-slate-200 hover:border-indigo-400 hover:bg-white hover:shadow-md'}
                      `}
                    >
                      {uploadedFileName ? (
                        <div className="space-y-2">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          </div>
                          <p className="text-xs font-semibold text-green-700 truncate px-2">{uploadedFileName}</p>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-400 hover:text-red-500" onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFileName(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}>Remove</Button>
                        </div>
                      ) : (
                        <>
                          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                            <Upload className="w-5 h-5 text-indigo-600" />
                          </div>
                          <p className="text-xs font-medium text-slate-600">Click to upload</p>
                          <p className="text-[9px] text-slate-400 mt-1">PDF, DOCX up to 5MB</p>
                        </>
                      )}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept=".pdf,.docx,.doc"
                      />
                    </div>

                    <div className="space-y-2">
                      <textarea 
                        className="w-full h-full min-h-[120px] p-4 text-[11px] border border-slate-200 bg-white rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none placeholder:text-slate-300"
                        placeholder="OR Paste resume text here..."
                        onChange={handleParseResumeText}
                      />
                    </div>
                  </div>

                  {isParsing && (
                    <div className="flex items-center gap-3 text-xs text-indigo-600 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin" /> 
                      <span className="font-medium">AI Extraction in progress...</span>
                    </div>
                  )}
                </section>

                <div className="border-t border-slate-100" />

                {/* Step 2: Details Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">2</div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Candidate Details</h3>
                      <p className="text-xs text-slate-500">Review and complete the profile information</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Group 1: Core Profile */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-3 bg-indigo-600 rounded-full" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Core Profile</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight ml-1">Full Name <span className="text-red-500">*</span></label>
                          <Input 
                            placeholder="e.g. John Doe"
                            className="h-11 rounded-xl border-slate-200 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500/10 transition-all text-sm font-medium"
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight ml-1">Technology <span className="text-red-500">*</span></label>
                          <Select value={formData.technology} onValueChange={v => setFormData({...formData, technology: v})}>
                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm font-medium text-sm"><SelectValue placeholder="Select Tech" /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {getMasterOptions('technology').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight ml-1">Experience <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <Input 
                              type="number" 
                              className="h-11 rounded-xl border-slate-200 bg-white shadow-sm pr-10 font-medium text-sm"
                              value={formData.experience} 
                              onChange={e => setFormData({...formData, experience: Number(e.target.value)})} 
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">YRS</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Group 2: Assignments */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-3 bg-indigo-600 rounded-full" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Assignments & Mentoring</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight ml-1">Team Lead <span className="text-red-500">*</span></label>
                          <Select value={formData.teamLead} onValueChange={v => setFormData({...formData, teamLead: v})}>
                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm font-medium text-sm"><SelectValue placeholder="Select Lead" /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {getMasterOptions('team_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight ml-1">RM Person <span className="text-red-500">*</span></label>
                          <Select value={formData.rmPerson} onValueChange={v => setFormData({...formData, rmPerson: v})}>
                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm font-medium text-sm"><SelectValue placeholder="Select RM" /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {getMasterOptions('rm_person').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight ml-1">Mentoring Lead (ML) <span className="text-red-500">*</span></label>
                          <Select value={formData.mentoringLead} onValueChange={v => setFormData({...formData, mentoringLead: v})}>
                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm font-medium text-sm"><SelectValue placeholder="Select ML" /></SelectTrigger>
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

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                <p className="text-[10px] text-slate-400 italic">All fields marked with * are mandatory</p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 rounded-xl shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:shadow-none" 
                    onClick={handleSubmit}
                    disabled={!isFormValid || isParsing}
                  >
                    {isParsing ? 'Parsing...' : 'Create Profile'}
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
