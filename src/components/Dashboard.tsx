import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { CheckCircle2, XCircle, Zap, Briefcase, TrendingUp, Filter, RotateCcw, Calendar as CalendarIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button, buttonVariants } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay, subDays, subMonths, subYears, startOfYear } from 'date-fns';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';

export default function Dashboard() {
  const [postings, setPostings] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  
  // Applied filters (used for stats and charts)
  const [appliedFilters, setAppliedFilters] = useState({
    technology: '',
    teamLead: '',
    rmPerson: '',
    mentoringLead: '',
    dateRange: { from: undefined as Date | undefined, to: undefined as Date | undefined }
  });

  // Draft filters (local UI state before clicking Apply)
  const [draftFilters, setDraftFilters] = useState({
    technology: '',
    teamLead: '',
    rmPerson: '',
    mentoringLead: '',
    dateRange: { from: undefined as Date | undefined, to: undefined as Date | undefined }
  });

  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'job_postings')), (snapshot) => {
      setPostings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubC = onSnapshot(query(collection(db, 'candidates')), (snapshot) => {
      setCandidates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubM = onSnapshot(query(collection(db, 'master_fields')), (snapshot) => {
      setMasters(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubP(); unsubC(); unsubM(); };
  }, []);

  const getMasterOptions = (type: string) => 
    masters.filter(m => m.type === type).sort((a, b) => a.name.localeCompare(b.name));

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const resetFilters = () => {
    const defaultFilters = {
      technology: '',
      teamLead: '',
      rmPerson: '',
      mentoringLead: '',
      dateRange: { from: undefined, to: undefined }
    };
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setActiveQuickFilter(null);
  };

  const setQuickFilter = (type: string) => {
    const today = new Date();
    let from: Date | undefined;
    let to: Date = today;

    switch (type) {
      case '30d': from = subDays(today, 30); break;
      case '90d': from = subDays(today, 90); break;
      case '120d': from = subDays(today, 120); break;
      case '6m': from = subMonths(today, 6); break;
      case '1y': from = subYears(today, 1); break;
      case 'ytd': from = startOfYear(today); break;
      default: break;
    }

    setDraftFilters(prev => ({
      ...prev,
      dateRange: { from, to }
    }));
    setActiveQuickFilter(type);
  };

  const filteredPostings = postings.filter(p => {
    const candidate = candidates.find(c => c.id === p.candidateId);
    if (!candidate) return false;

    // Filter by Dropdowns
    if (appliedFilters.technology && candidate.technology !== appliedFilters.technology) return false;
    if (appliedFilters.teamLead && candidate.teamLead !== appliedFilters.teamLead) return false;
    if (appliedFilters.rmPerson && candidate.rmPerson !== appliedFilters.rmPerson) return false;
    if (appliedFilters.mentoringLead && candidate.mentoringLead !== appliedFilters.mentoringLead) return false;

    // Filter by Date Range
    if (appliedFilters.dateRange.from || appliedFilters.dateRange.to) {
      const postingDateStr = p.date || (p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null);
      if (!postingDateStr) return false;

      const pDate = parseISO(postingDateStr);
      const start = appliedFilters.dateRange.from ? startOfDay(appliedFilters.dateRange.from).getTime() : 0;
      const end = appliedFilters.dateRange.to ? endOfDay(appliedFilters.dateRange.to).getTime() : Infinity;
      const pTime = pDate.getTime();

      if (pTime < start || pTime > end) return false;
    }

    return true;
  });

  const analyzed = filteredPostings.filter(p => p.status === 'completed');
  const eaCount = analyzed.filter(p => p.analysis?.isEasyApply).length;
  const goodFitCount = analyzed.filter(p => p.analysis?.isGoodFit).length;
  const notFitCount = analyzed.filter(p => !p.analysis?.isGoodFit).length;
  const expMismatchCount = analyzed.filter(p => p.analysis?.scenario === 'SC1' && !p.analysis?.isGoodFit).length;

  const chartData = [
    { name: 'Good Fit', value: goodFitCount, color: '#3b82f6' },
    { name: 'Not Good Fit', value: notFitCount, color: '#f97316' },
    { name: 'EA Detected', value: eaCount, color: '#10b981' },
  ];

  const sourceData = analyzed.reduce((acc: any[], p) => {
    const source = p.source || 'Other';
    const existing = acc.find(a => a.name === source);
    if (existing) existing.value++;
    else acc.push({ name: source, value: 1 });
    return acc;
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img
              src="https://media.licdn.com/dms/image/v2/D560BAQHb8YGr2pLlkg/company-logo_200_200/company-logo_200_200/0/1718865466422/ncpl_consulting_logo?e=1778112000&v=beta&t=kvyWVN04xTOucmZftxV-kwczAhPSKztgXacrs5hZDbQ"
              alt="NCPL Logo"
              style={{ height: '56px', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
            <div className="h-10 w-px bg-slate-200 hidden md:block" />
            <div>
              <h2 className="text-2xl font-bold text-indigo-800 tracking-tight">Dashboard Overview</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">NCPL Consulting Services</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-slate-400 text-xs font-medium">
            <TrendingUp className="w-4 h-4" />
            <span>Real-time analysis active</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl">
                <Filter className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <span className="text-base font-bold text-slate-800">Analytics Filters</span>
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Refine your overview statistics</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetFilters} 
                className="h-9 px-4 text-slate-500 hover:text-red-600 hover:bg-red-50 gap-2 rounded-xl transition-all font-bold text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
              <Button 
                size="sm" 
                onClick={applyFilters} 
                className="h-9 px-6 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 rounded-xl transition-all font-bold text-xs"
              >
                Apply Filters
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Technology</label>
              <Select value={draftFilters.technology} onValueChange={v => setDraftFilters({...draftFilters, technology: v === 'all' ? '' : v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select Technology" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-slate-400 italic">Clear Selection</SelectItem>
                  {getMasterOptions('technology').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Team Lead</label>
              <Select value={draftFilters.teamLead} onValueChange={v => setDraftFilters({...draftFilters, teamLead: v === 'all' ? '' : v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select Team Lead" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-slate-400 italic">Clear Selection</SelectItem>
                  {getMasterOptions('team_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">RM Person</label>
              <Select value={draftFilters.rmPerson} onValueChange={v => setDraftFilters({...draftFilters, rmPerson: v === 'all' ? '' : v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select RM Person" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-slate-400 italic">Clear Selection</SelectItem>
                  {getMasterOptions('rm_person').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Mentoring Lead</label>
              <Select value={draftFilters.mentoringLead} onValueChange={v => setDraftFilters({...draftFilters, mentoringLead: v === 'all' ? '' : v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select Mentoring Lead" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-slate-400 italic">Clear Selection</SelectItem>
                  {getMasterOptions('mentoring_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Date Range</label>
              <Popover>
                <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-11 w-full justify-start text-left font-medium rounded-xl border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all",
                      !draftFilters.dateRange.from && "text-slate-500"
                    )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                  {draftFilters.dateRange?.from ? (
                    draftFilters.dateRange.to ? (
                      <>
                        {format(draftFilters.dateRange.from, "LLL dd, y")} -{" "}
                        {format(draftFilters.dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(draftFilters.dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span className="text-slate-400">Select Date Range</span>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl border-slate-100" align="start">
                  <div className="p-4 border-b border-slate-50 flex flex-wrap gap-2 bg-slate-50/30">
                    {[
                      { label: '30D', value: '30d' },
                      { label: '90D', value: '90d' },
                      { label: '120D', value: '120d' },
                      { label: '6M', value: '6m' },
                      { label: '1Y', value: '1y' },
                      { label: 'YTD', value: 'ytd' }
                    ].map(q => (
                      <button
                        key={q.value}
                        onClick={() => setQuickFilter(q.value)}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                          activeQuickFilter === q.value
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                            : "bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200"
                        )}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <Calendar
                    initialFocus
                    mode="range"
                    captionLayout="dropdown-buttons"
                    fromYear={2020}
                    toYear={new Date().getFullYear()}
                    defaultMonth={draftFilters.dateRange?.from}
                    selected={{ from: draftFilters.dateRange.from, to: draftFilters.dateRange.to }}
                    onSelect={(range: any) => {
                      setDraftFilters({...draftFilters, dateRange: { from: range?.from, to: range?.to }});
                      setActiveQuickFilter(null);
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Analyzed" value={analyzed.length} icon={<Briefcase className="w-5 h-5 text-blue-600" />} />
        <StatCard title="EA Detected" value={eaCount} icon={<Zap className="w-5 h-5 text-green-600" />} />
        <StatCard title="Good Fit" value={goodFitCount} icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />} />
        <StatCard title="Not Good Fit" value={notFitCount} icon={<XCircle className="w-5 h-5 text-orange-500" />} />
        <StatCard title="EXP > Resume" value={expMismatchCount} icon={<TrendingUp className="w-5 h-5 text-purple-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Analysis Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center gap-4">
        <div className="p-3 bg-slate-100 rounded-lg">{icon}</div>
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-indigo-800">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
