'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }), 
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push('/');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Cannot connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-primary transform -skew-y-3 origin-top-right -z-10 shadow-lg opacity-90"></div>

      <div className="w-full max-w-5xl bg-card rounded-3xl shadow-2xl flex overflow-hidden border border-border/40 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Left Side: Information / Branding */}
        <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-primary to-primary/90 text-primary-foreground p-12 flex-col justify-between relative overflow-hidden border-r border-border/10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-bl-full -z-0"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/20 rounded-tr-full -z-0"></div>
          
          <div className="z-10 relative">
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary font-bold text-2xl shadow-inner">
                K
              </div>
              <h1 className="text-3xl font-bold tracking-wider">KEIL ERP</h1>
            </div>
            
            <h2 className="text-4xl font-extrabold leading-tight mb-6">
              Empowering Biomedical Waste & Fleet Management.
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-md">
              Streamline route assignments, monitor vehicle telemetry and logs, manage HCE collections, and track HR & payroll in one robust system.
            </p>
          </div>

          <div className="z-10 flex space-x-6 text-sm font-medium text-primary-foreground/70">
            <span>Enterprise Grade</span>
            <span>•</span>
            <span>Secure</span>
            <span>•</span>
            <span>Fast</span>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full lg:w-1/2 p-10 sm:p-14 flex flex-col justify-center bg-card">
          <div className="mb-10 lg:hidden flex items-center space-x-3">
             <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-inner">K</div>
             <h1 className="text-2xl font-bold text-primary tracking-wider">KEIL</h1>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-foreground mb-2">Welcome Back</h2>
            <p className="text-muted-foreground">Please sign in to your unified workstation</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border-l-4 border-red-500 text-red-500 text-sm font-medium rounded-r-lg flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">Username / Email</label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3.5 top-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="admin@keil.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 h-12 bg-background/50 border-input focus:bg-background transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">Password</label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3.5 top-3 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 h-12 bg-background/50 border-input focus:bg-background transition-all"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold transition-all group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}
