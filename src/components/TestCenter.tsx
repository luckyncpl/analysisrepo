import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { CheckCircle2, XCircle, Play, Loader2, Search, Link2, BrainCircuit, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { calculateJobFit } from '../lib/matchingEngine';

export default function TestCenter() {
  const [testUrl, setTestUrl] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<any>(null);

  const [matchTest, setMatchTest] = useState({ jdMin: 5, candRole: 4, candTotal: 10 });
  const [matchResult, setMatchResult] = useState<any>(null);

  const runUrlTest = async () => {
    if (!testUrl) return;
    setIsResolving(true);
    setResolveResult(null);
    try {
      const res = await fetch('/api/resolve-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl })
      });
      const data = await res.json();
      setResolveResult(data);
      toast.success('URL Resolution Test Complete');
    } catch (error) {
      toast.error('URL Resolution Failed');
    } finally {
      setIsResolving(false);
    }
  };

  const runMatchTest = () => {
    const result = calculateJobFit(matchTest.jdMin, matchTest.candRole, matchTest.candTotal);
    setMatchResult(result);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-indigo-800">Core Engine Diagnostic Lab</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* URL Resolution Test */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-600" />
              URL Resolution & Redirect Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Paste TinyURL or Job Link..." 
                value={testUrl}
                onChange={e => setTestUrl(e.target.value)}
              />
              <Button onClick={runUrlTest} disabled={isResolving}>
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </Button>
            </div>

            {resolveResult && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-500 uppercase">Method:</span>
                  <span className="font-mono text-blue-600">{resolveResult.method || 'unknown'}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Final URL:</p>
                  <p className="text-xs font-mono break-all bg-white p-2 border rounded">{resolveResult.finalUrl}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Successfully resolved and reachable
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Matching Logic Test */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" />
              Experience Matching Logic (SC1-SC3)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">JD Min Exp</label>
                <Input type="number" value={matchTest.jdMin} onChange={e => setMatchTest({...matchTest, jdMin: Number(e.target.value)})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Cand Role Exp</label>
                <Input type="number" value={matchTest.candRole} onChange={e => setMatchTest({...matchTest, candRole: Number(e.target.value)})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Cand Total Exp</label>
                <Input type="number" value={matchTest.candTotal} onChange={e => setMatchTest({...matchTest, candTotal: Number(e.target.value)})} />
              </div>
            </div>
            <Button className="w-full" onClick={runMatchTest}>Run Logic Check</Button>

            {matchResult && (
              <div className={`p-4 rounded-lg border space-y-2 ${
                matchResult.isGoodFit ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-500">Verdict:</span>
                  <span className={`text-sm font-bold ${matchResult.isGoodFit ? 'text-blue-700' : 'text-orange-700'}`}>
                    {matchResult.status}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-500 uppercase">Scenario:</span>
                  <span className="font-mono font-bold">{matchResult.scenario}</span>
                </div>
                <p className="text-xs text-slate-600 italic">"{matchResult.reason}"</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Golden Test Scenarios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-purple-600" />
            Standard Scenario Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScenarioCard 
              title="SC1: Close Match" 
              desc="JD: 5-7y, Resume: 5y" 
              onRun={() => { setMatchTest({ jdMin: 5, candRole: 5, candTotal: 8 }); runMatchTest(); }}
            />
            <ScenarioCard 
              title="SC1: 1y Gap" 
              desc="JD: 5-7y, Resume: 4y" 
              onRun={() => { setMatchTest({ jdMin: 5, candRole: 4, candTotal: 6 }); runMatchTest(); }}
            />
            <ScenarioCard 
              title="SC2: Significant Gap" 
              desc="JD: 5+y, Resume: 3y" 
              onRun={() => { setMatchTest({ jdMin: 5, candRole: 3, candTotal: 5 }); runMatchTest(); }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioCard({ title, desc, onRun }: { title: string; desc: string; onRun: () => void }) {
  return (
    <div className="p-4 border rounded-lg hover:border-indigo-300 transition-colors cursor-pointer group" onClick={onRun}>
      <div className="flex justify-between items-start mb-2">
        <h4 className="text-sm font-bold text-slate-700">{title}</h4>
        <Play className="w-3 h-3 text-slate-400 group-hover:text-indigo-600" />
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </div>
  );
}
