import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, FileSpreadsheet, CheckCircle2, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { format } from 'date-fns';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from 'firebase/firestore';

interface GoogleSheetsSyncProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: any[];
  existingPostings: any[];
  onSyncComplete: (newPostings: any[]) => void;
}

export default function GoogleSheetsSync({ isOpen, onClose, candidates, existingPostings, onSyncComplete }: GoogleSheetsSyncProps) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [gid, setGid] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [syncSummary, setSyncSummary] = useState<{
    total: number;
    imported: number;
    duplicates: number;
    invalid: number;
  } | null>(null);

  const extractSheetId = (url: string) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleSync = async () => {
    if (!sheetUrl) {
      toast.error('Please enter a Google Sheet URL');
      return;
    }
    if (!selectedCandidate) {
      toast.error('Please select a candidate');
      return;
    }

    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      toast.error('Invalid Google Sheet URL');
      return;
    }

    setIsFetching(true);
    setSyncSummary(null);

    try {
      // Use the server-side proxy to bypass CORS
      let fetchUrl = `/api/fetch-sheet?sheetId=${sheetId}`;
      
      let targetGid = gid;
      if (!targetGid) {
        const urlGidMatch = sheetUrl.match(/[#&]gid=([0-9]+)/);
        if (urlGidMatch) {
          targetGid = urlGidMatch[1];
        }
      }
      
      if (targetGid) {
        fetchUrl += `&gid=${targetGid}`;
      }

      const response = await fetch(fetchUrl);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch sheet data. Ensure the sheet is shared as "Anyone with the link can view".');
      }

      const csvText = await response.text();
      
      Papa.parse(csvText, {
        complete: async (results) => {
          const rows = results.data as string[][];
          if (rows.length === 0) {
            toast.error('No data found in the sheet');
            setIsFetching(false);
            return;
          }

          // 1. Find the header row dynamically
          const expectedHeaders = ['ROLE NAME', 'JOB POST URL', 'DATE', 'COMPANY NAME', 'SOURCE'];
          let headerIndex = -1;
          let columnMapping: Record<string, number> = {};

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i].map(cell => cell?.toString().toUpperCase().trim());
            
            // Check if all expected headers are present in this row
            const foundHeaders = expectedHeaders.filter(h => row.includes(h));
            
            // We require at least 4 out of 5 to be safe, but ideally all 5
            if (foundHeaders.length === 5) {
              headerIndex = i;
              expectedHeaders.forEach(h => {
                columnMapping[h] = row.indexOf(h);
              });
              break;
            }
          }

          if (headerIndex === -1) {
            toast.error('Could not find the table header. Ensure your sheet has these columns: ROLE NAME, JOB POST URL, DATE, COMPANY NAME, SOURCE');
            setIsFetching(false);
            return;
          }

          // 2. Process data rows starting AFTER the header
          const newPostings: any[] = [];
          let duplicates = 0;
          let invalid = 0;

          for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const role = row[columnMapping['ROLE NAME']]?.toString().trim();
            const url = row[columnMapping['JOB POST URL']]?.toString().trim();
            const date = row[columnMapping['DATE']]?.toString().trim();
            const company = row[columnMapping['COMPANY NAME']]?.toString().trim();
            const source = row[columnMapping['SOURCE']]?.toString().trim();

            // Mandatory rule 6: Skip rows where both Role and URL are empty
            if (!role && !url) {
              continue;
            }

            // Mandatory rule 5: Skip blank rows
            const isBlankRow = row.every(cell => !cell || cell.toString().trim() === "");
            if (isBlankRow) {
              continue;
            }

            // Basic validation for a valid posting row
            if (!role || !url) {
              invalid++;
              continue;
            }

            // Duplicate detection
            const isDuplicate = existingPostings.some(p => 
              p.tinyUrl === url || 
              (p.role === role && p.company === company && p.date === date)
            );

            if (isDuplicate) {
              duplicates++;
              continue;
            }

            newPostings.push({
              candidateId: selectedCandidate,
              role,
              tinyUrl: url,
              date: date || format(new Date(), 'yyyy-MM-dd'),
              company: company || 'Unknown',
              source: source || 'LinkedIn',
              status: 'Synced'
            });
          }

          setSyncSummary({
            total: newPostings.length + duplicates + invalid,
            imported: newPostings.length,
            duplicates,
            invalid
          });

          if (newPostings.length > 0) {
            onSyncComplete(newPostings);
            toast.success(`Successfully imported ${newPostings.length} postings`);
            
            // Update lastSync metadata
            try {
              const metaSnap = await getDocs(query(collection(db, 'automation_metadata'), where('id', '==', 'last_run')));
              const metaData = {
                id: 'last_run',
                lastSync: new Date().toISOString()
              };
              if (metaSnap.empty) {
                await addDoc(collection(db, 'automation_metadata'), metaData);
              } else {
                await updateDoc(doc(db, 'automation_metadata', metaSnap.docs[0].id), { lastSync: metaData.lastSync });
              }
            } catch (e) {
              console.error("Failed to update sync metadata", e);
            }
          } else if (duplicates > 0) {
            toast.info('No new postings found. All rows were duplicates.');
          } else {
            toast.warning('No valid postings found in the sheet.');
          }
          
          setIsFetching(false);
        },
        error: (error) => {
          console.error('CSV Parsing Error:', error);
          toast.error('Failed to parse sheet data');
          setIsFetching(false);
        }
      });

    } catch (error: any) {
      console.error('Sync Error:', error);
      toast.error(error.message || 'Failed to sync with Google Sheets');
      setIsFetching(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Sync Google Sheets
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 leading-relaxed">
              Ensure your Google Sheet is shared as <strong>"Anyone with the link can view"</strong>. 
              The sync will automatically detect the table starting with columns: 
              <span className="font-bold"> ROLE NAME, JOB POST URL, DATE, COMPANY NAME, SOURCE</span>.
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Google Sheet URL</label>
                <Input 
                  placeholder="https://docs.google.com/spreadsheets/d/..." 
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Sheet ID (gid) <span className="text-[10px] font-normal text-slate-400">(Optional)</span></label>
                <Input 
                  placeholder="e.g. 0" 
                  value={gid}
                  onChange={(e) => setGid(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Assign to Candidate</label>
              <Select value={selectedCandidate} onValueChange={setSelectedCandidate}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select Candidate" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {syncSummary && (
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Sync Summary</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="font-medium">{syncSummary.imported} Imported</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{syncSummary.duplicates} Duplicates</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <span className="font-medium">{syncSummary.invalid} Invalid/Skipped</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isFetching}>Cancel</Button>
          <Button 
            onClick={handleSync} 
            disabled={isFetching || !sheetUrl || !selectedCandidate}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 rounded-xl"
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Fetching...
              </>
            ) : (
              'Fetch and Sync'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
