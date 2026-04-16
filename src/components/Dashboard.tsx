import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { CheckCircle2, XCircle, Zap, Briefcase, TrendingUp, Filter, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';

export default function Dashboard() {
  const [postings, setPostings] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  
  const [filters, setFilters] = useState({
    technology: 'all',
    teamLead: 'all',
    rmPerson: 'all',
    mentoringLead: 'all'
  });

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

  const resetFilters = () => {
    setFilters({
      technology: 'all',
      teamLead: 'all',
      rmPerson: 'all',
      mentoringLead: 'all'
    });
  };

  const filteredPostings = postings.filter(p => {
    const candidate = candidates.find(c => c.id === p.candidateId);
    if (!candidate) return false;

    if (filters.technology !== 'all' && candidate.technology !== filters.technology) return false;
    if (filters.teamLead !== 'all' && candidate.teamLead !== filters.teamLead) return false;
    if (filters.rmPerson !== 'all' && candidate.rmPerson !== filters.rmPerson) return false;
    if (filters.mentoringLead !== 'all' && candidate.mentoringLead !== filters.mentoringLead) return false;

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

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Filter className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-800">Analytics Filters</span>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Refine your data view</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={resetFilters} 
              className="h-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 gap-2 rounded-lg transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">Reset Filters</span>
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Technology</label>
              <Select value={filters.technology} onValueChange={v => setFilters({...filters, technology: v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/30 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select Technology" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Select Technology</SelectItem>
                  {getMasterOptions('technology').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Team Lead</label>
              <Select value={filters.teamLead} onValueChange={v => setFilters({...filters, teamLead: v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/30 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select Team Lead" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Select Team Lead</SelectItem>
                  {getMasterOptions('team_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">RM Person</label>
              <Select value={filters.rmPerson} onValueChange={v => setFilters({...filters, rmPerson: v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/30 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select RM Person" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Select RM Person</SelectItem>
                  {getMasterOptions('rm_person').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Mentoring Lead (ML)</label>
              <Select value={filters.mentoringLead} onValueChange={v => setFilters({...filters, mentoringLead: v})}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/30 hover:bg-white hover:border-indigo-200 transition-all text-sm font-medium">
                  <SelectValue placeholder="Select Mentor" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Select Mentor</SelectItem>
                  {getMasterOptions('mentoring_lead').map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
