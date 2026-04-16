import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Button, buttonVariants } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from './ui/dialog';
import { Trash2, Plus, FileText, Loader2, AlertCircle, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

type FieldType = 'technology' | 'team_lead' | 'rm_person' | 'mentoring_lead';

export default function MasterManagement() {
  const [fields, setFields] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [activeTab, setActiveTab] = useState<FieldType>('technology');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  useEffect(() => {
    setSelectedIds([]); // Reset selection when tab changes
  }, [activeTab]);

  useEffect(() => {
    const q = query(collection(db, 'master_fields'));
    return onSnapshot(q, (snapshot) => {
      setFields(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const addField = async (name: string, type: FieldType) => {
    if (!name.trim()) return;
    try {
      await addDoc(collection(db, 'master_fields'), {
        name: name.trim(),
        type,
        createdAt: serverTimestamp()
      });
      setNewName('');
      toast.success(`${name} added successfully`);
    } catch (error) {
      toast.error('Failed to add field');
    }
  };

  const handleBulkAdd = async () => {
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) return;
    
    try {
      for (const name of names) {
        await addDoc(collection(db, 'master_fields'), {
          name,
          type: activeTab,
          createdAt: serverTimestamp()
        });
      }
      setBulkText('');
      toast.success(`Bulk added ${names.length} items`);
    } catch (error) {
      toast.error('Failed to bulk add items');
    }
  };

  const deleteField = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'master_fields', id));
      setSelectedIds(prev => prev.filter(i => i !== id));
      setDeleteTarget(null);
      toast.success('Field deleted');
    } catch (error) {
      toast.error('Failed to delete field');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    setIsBulkDeleting(true);
    const toastId = toast.loading(`Deleting ${selectedIds.length} items...`);

    try {
      const BATCH_SIZE = 500;
      const chunks = [];
      for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
        chunks.push(selectedIds.slice(i, i + BATCH_SIZE));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => {
          batch.delete(doc(db, 'master_fields', id));
        });
        await batch.commit();
      }

      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      toast.success(`Successfully deleted ${selectedIds.length} items`, { id: toastId });
    } catch (error) {
      console.error('Error in bulk delete:', error);
      toast.error('Failed to delete items', { id: toastId });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredFields.map(f => f.id));
    } else {
      setSelectedIds([]);
    }
  };

  const filteredFields = fields
    .filter(f => f.type === activeTab)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-indigo-800">Master Data Management</h2>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FieldType)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="technology">Technology</TabsTrigger>
          <TabsTrigger value="team_lead">Team Lead</TabsTrigger>
          <TabsTrigger value="rm_person">RM Person</TabsTrigger>
          <TabsTrigger value="mentoring_lead">Mentoring Lead</TabsTrigger>
        </TabsList>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Form */}
          <Card className="lg:col-span-1 border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="px-8 pt-8 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                  <Plus className="w-4 h-4" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">Add New Entry</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-0 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 ring-4 ring-slate-50">1</div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Single Entry</label>
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Enter name..." 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-11 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all text-sm font-medium"
                  />
                  <Button 
                    className="h-11 w-11 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                    onClick={() => addField(newName, activeTab)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 ring-4 ring-slate-50">2</div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Bulk Ingestion</label>
                </div>
                <textarea 
                  className="w-full h-40 p-4 text-sm font-medium border border-slate-100 bg-slate-50/50 rounded-2xl shadow-inner focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-none placeholder:text-slate-300 transition-all"
                  placeholder="Paste multiple items here (one per line)..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <Button 
                  className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold gap-2 transition-all shadow-lg shadow-slate-100" 
                  onClick={handleBulkAdd}
                >
                  <FileText className="w-4 h-4" />
                  Bulk Add Entries
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* List Table */}
          <Card className="lg:col-span-2 border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="px-8 py-6 border-b border-slate-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 capitalize">{activeTab.replace('_', ' ')} List</CardTitle>
                <CardDescription className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Manage master data entries
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {selectedIds.length > 0 && (
                  <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
                    <DialogTrigger className={cn(buttonVariants({ variant: "destructive" }), "h-9 px-4 rounded-xl gap-2 font-bold shadow-lg shadow-red-100 animate-in zoom-in-95")}>
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
                          Are you sure you want to permanently delete <span className="text-red-600 font-bold">{selectedIds.length}</span> items from the master list?
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
                <div className="px-3 py-1 bg-slate-50 rounded-lg border border-slate-100 text-[10px] font-bold text-slate-500">
                  {filteredFields.length} Total
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-100">
                    <TableHead className="w-[50px] pl-8">
                      <Checkbox 
                        checked={filteredFields.length > 0 && selectedIds.length === filteredFields.length}
                        onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                        className="rounded-md border-slate-300 data-[state=checked]:bg-indigo-600"
                      />
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-400 h-14">Name</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-widest text-slate-400 h-14 text-right pr-8">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center gap-3 grayscale opacity-40">
                          <LayoutGrid className="w-12 h-12 text-slate-300" />
                          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No entries found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFields.map((field) => (
                      <TableRow key={field.id} className="hover:bg-slate-50/80 transition-all group border-b border-slate-50">
                        <TableCell className="pl-8">
                          <Checkbox 
                            checked={selectedIds.includes(field.id)}
                            onCheckedChange={() => toggleSelection(field.id)}
                            className="rounded-md border-slate-300 data-[state=checked]:bg-indigo-600"
                          />
                        </TableCell>
                        <TableCell className="font-bold text-slate-700 uppercase tracking-tight text-sm py-4">{field.name}</TableCell>
                        <TableCell className="pr-8 text-right">
                          <Dialog open={!!deleteTarget && deleteTarget.id === field.id} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                            <DialogTrigger className="h-8 w-8 inline-flex items-center justify-center text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg group-hover:opacity-100 transition-all">
                              <Trash2 className="w-4 h-4" onClick={() => setDeleteTarget(field)} />
                            </DialogTrigger>
                            <DialogContent className="rounded-3xl border-none shadow-2xl">
                              <DialogHeader className="space-y-3">
                                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-2">
                                  <Trash2 className="w-6 h-6 text-red-600" />
                                </div>
                                <DialogTitle className="text-xl font-bold">Delete Entry</DialogTitle>
                                <DialogDescription className="text-slate-500 font-medium">
                                  Are you sure you want to delete <span className="text-red-600 font-bold">"{field.name}"</span>? 
                                  This will remove it from all candidate dropdowns.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter className="gap-3 sm:gap-0 mt-4">
                                <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="rounded-xl h-12 font-bold">
                                  Cancel
                                </Button>
                                <Button variant="destructive" onClick={() => deleteField(field.id)} className="rounded-xl h-12 px-8 font-bold shadow-lg shadow-red-100">
                                  Delete Entry
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Tabs>
    </div>
  );
}
