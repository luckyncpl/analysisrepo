import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Database, Monitor, LogOut, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import Dashboard from './components/Dashboard';
import MasterManagement from './components/MasterManagement';
import CandidateMaster from './components/CandidateMaster';
import JobMonitor from './components/JobMonitor';
import TestCenter from './components/TestCenter';
import UserManagement from './components/UserManagement';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Fallback Auth States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // Check for local session first
    const localSession = localStorage.getItem('ncpl_auth_session');
    if (localSession) {
      const sessionData = JSON.parse(localSession);
      setUser(sessionData);
      setIsAuthorized(true);
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        if (['aiworkshop92@gmail.com', 'narayana.uda@ncplconsulting.net'].includes(u.email || '')) {
          setIsAuthorized(true);
        } else {
          try {
            const q = query(collection(db, 'users'), where('email', '==', u.email?.toLowerCase()));
            const snapshot = await getDocs(q);
            setIsAuthorized(!snapshot.empty);
          } catch (error) {
            console.error("Auth check failed:", error);
            setIsAuthorized(false);
          }
        }
      } else {
        setIsAuthorized(null);
      }
      setLoading(false);
    });
  }, []);

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((err) => {
      console.error("Google Sign-In Error:", err);
      setAuthError("Google Sign-In failed. Please use the fallback login below.");
      setShowFallback(true);
    });
  };

  const handleFallbackLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    // Default Credentials
    const DEFAULT_EMAIL = 'admin@ncpl.local';
    const DEFAULT_PASS = 'Admin@123';

    if (email === DEFAULT_EMAIL && password === DEFAULT_PASS) {
      const mockUser = {
        uid: 'local-admin',
        displayName: 'NCPL Admin',
        email: DEFAULT_EMAIL,
        photoURL: 'https://ui-avatars.com/api/?name=NCPL+Admin&background=4f46e5&color=fff'
      };
      localStorage.setItem('ncpl_auth_session', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAuthorized(true);
    } else {
      setAuthError('Invalid email or password');
    }
  };

  const logout = () => {
    localStorage.removeItem('ncpl_auth_session');
    signOut(auth);
    setUser(null);
    setIsAuthorized(null);
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-4">
        <div className="p-10 bg-white rounded-3xl shadow-2xl text-center max-w-md w-full border border-slate-100">
          <div className="mb-8 flex justify-center">
            <img
              src="https://media.licdn.com/dms/image/v2/D560BAQHb8YGr2pLlkg/company-logo_200_200/company-logo_200_200/0/1718865466422/ncpl_consulting_logo?e=1778112000&v=beta&t=kvyWVN04xTOucmZftxV-kwczAhPSKztgXacrs5hZDbQ"
              alt="NCPL Logo"
              style={{ height: '56px', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-indigo-900 tracking-tight">RM Job Monitor</h1>
          <p className="text-slate-500 mb-8 text-sm font-medium">NCPL Consulting Organization Portal</p>
          
          <div className="space-y-4">
            <Button onClick={login} className="w-full py-7 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 rounded-2xl transition-all hover:scale-[1.02]">
              Sign in with Google
            </Button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400 font-bold">Or fallback login</span>
              </div>
            </div>

            <form onSubmit={handleFallbackLogin} className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="admin@ncpl.local"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              
              {authError && (
                <p className="text-xs font-bold text-red-500 text-center bg-red-50 py-2 rounded-lg border border-red-100">
                  {authError}
                </p>
              )}

              <Button type="submit" variant="secondary" className="w-full h-12 rounded-xl font-bold">
                Sign In with Credentials
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="p-8 bg-white rounded-xl shadow-lg text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4 text-red-600">Access Denied</h1>
          <p className="text-slate-600 mb-8">
            Your account ({user.email}) is not authorized to access this system. 
            Please contact an administrator to request access.
          </p>
          <Button onClick={logout} variant="outline" className="w-full">Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-8 border-b border-slate-50">
            <img
              src="https://media.licdn.com/dms/image/v2/D560BAQHb8YGr2pLlkg/company-logo_200_200/company-logo_200_200/0/1718865466422/ncpl_consulting_logo?e=1778112000&v=beta&t=kvyWVN04xTOucmZftxV-kwczAhPSKztgXacrs5hZDbQ"
              alt="NCPL Logo"
              style={{ height: '56px', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
            <div className="mt-4">
              <h1 className="text-sm font-bold text-indigo-900 leading-tight uppercase tracking-tight">RM Job Monitor</h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Organization Portal</p>
            </div>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <NavItem to="/" icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" />
            <NavItem to="/monitor" icon={<Monitor className="w-5 h-5" />} label="Job Monitor" />
            <NavItem to="/candidates" icon={<Users className="w-5 h-5" />} label="Candidates" />
            <NavItem to="/master" icon={<Database className="w-5 h-5" />} label="Master Data" />
            <NavItem to="/users" icon={<ShieldCheck className="w-5 h-5" />} label="User Management" />
            <NavItem to="/tests" icon={<CheckCircle2 className="w-5 h-5" />} label="Test Center" />
          </nav>

          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-4 p-2">
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-indigo-800 truncate">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-slate-600 hover:text-red-600" onClick={logout}>
              <LogOut className="w-5 h-5 mr-2" />
              Logout
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/monitor" element={<JobMonitor />} />
            <Route path="/candidates" element={<CandidateMaster />} />
            <Route path="/master" element={<MasterManagement />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/tests" element={<TestCenter />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </Router>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 text-slate-600 rounded-lg hover:bg-slate-100 hover:text-indigo-800 transition-colors"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
}
