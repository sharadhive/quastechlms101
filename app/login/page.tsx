'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ROLE_HOME } from '@/lib/client/api';
import { clearMe } from '@/lib/client/useMe';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = (res: any) => {
    localStorage.setItem('qs_role', res.role);
    clearMe(); localStorage.setItem('qs_name', res.name ?? '');
    // Return to the page the user originally opened (only inside their own panel)
    const next = new URLSearchParams(window.location.search).get('next') ?? '';
    const home = ROLE_HOME[res.role] ?? '/';
    const target = next.startsWith(home + '/') || next === home ? next : home;
    router.push(res.mustChangePassword ? '/change-password' : target);
  };

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      if (mode === 'password') finish(await api('/api/auth/login', { method: 'POST', json: { email, password } }));
      else if (!otpSent) { await api('/api/auth/otp/request', { method: 'POST', json: { email } }); setOtpSent(true); }
      else finish(await api('/api/auth/otp/verify', { method: 'POST', json: { email, code } }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-split">
      <div className="auth-split-left">
        <div className="auth-split-left-content">
          <h2>Empower Your Learning Journey</h2>
          <p>Access your courses, track your progress, and achieve your goals with the world's most advanced learning platform.</p>
        </div>
      </div>
      <div className="auth-split-right">
        <div className="auth-split-card">
          <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <img src="/logo.png" alt="QUASTECH" style={{ height: 40 }} />
            LMS
          </h1>
          <p className="sub">Welcome back! Sign in to continue.</p>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
        {mode === 'password' && (<><label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" onKeyDown={(e) => e.key === 'Enter' && submit()} /></>)}
        {mode === 'otp' && otpSent && (<><label>6-digit code (check email / Outbox)</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} onKeyDown={(e) => e.key === 'Enter' && submit()} /></>)}
        {err && <div className="err">{err}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={busy || !email} onClick={submit}>
          {mode === 'password' ? 'Sign in' : otpSent ? 'Verify code' : 'Send code'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'password' ? 'otp' : 'password'); setOtpSent(false); setErr(''); }}>
            {mode === 'password' ? 'Login with email OTP instead' : 'Login with password instead'}
          </a>
        </p>
        <p style={{ textAlign: 'center', marginTop: 4 }}>
          <a href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Forgot password?</a>
        </p>
      </div>
    </div>
    </div>
  );
}
