import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Trash2, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';

type FieldType = 'technology' | 'team_lead' | 'rm_person' | 'mentoring_lead';

export default function MasterManagement() {
  const [fields, setFields] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [activeTab, setActiveTab] = useState<FieldType>('technology');

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
      toast.success('Field deleted');
    } catch (error) {
      toast.error('Failed to delete field');
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
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Add New Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Single Entry</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Enter name..." 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <Button onClick={() => addField(newName, activeTab)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <label className="text-sm font-medium">Bulk Paste (one per line)</label>
                <textarea 
                  className="w-full h-32 p-3 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Paste multiple items here..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <Button variant="secondary" className="w-full" onClick={handleBulkAdd}>
                  <FileText className="w-4 h-4 mr-2" />
                  Bulk Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* List Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg capitalize">{activeTab.replace('_', ' ')} List</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-slate-500 py-8">
                        No entries found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFields.map((field) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium">{field.name}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-slate-400 hover:text-red-600"
                            onClick={() => deleteField(field.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
