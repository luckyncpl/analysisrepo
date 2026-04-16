import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Trash2, UserPlus, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');

  useEffect(() => {
    const q = query(collection(db, 'users'));
    return onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const addUser = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }

    const email = newEmail.trim().toLowerCase();

    // Check if user already exists
    if (users.some(u => u.email === email)) {
      toast.error('User already authorized');
      return;
    }

    try {
      await addDoc(collection(db, 'users'), {
        email,
        role: newRole,
        createdAt: serverTimestamp()
      });
      setNewEmail('');
      toast.success(`User ${email} added successfully`);
    } catch (error) {
      toast.error('Failed to add user');
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
      toast.success('User removed');
    } catch (error) {
      toast.error('Failed to remove user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-indigo-800">User Management</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add User Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Authorize New User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Gmail Address</label>
              <Input 
                type="email"
                placeholder="user@gmail.com" 
                value={newEmail} 
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={addUser}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </CardContent>
        </Card>

        {/* User List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Authorized Users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-500 py-8">
                      No authorized users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {u.role === 'admin' ? (
                            <Shield className="w-4 h-4 text-blue-600" />
                          ) : (
                            <User className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="capitalize">{u.role}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => deleteUser(u.id)}
                          disabled={u.email === 'aiworkshop92@gmail.com'} // Protect default admin
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
    </div>
  );
}
