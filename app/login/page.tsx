'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ROLE_HOME } from '@/lib/client/api';

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
    localStorage.setItem('qs_name', res.name ?? '');
    router.push(res.mustChangePassword ? '/change-password' : (ROLE_HOME[res.role] ?? '/'));
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
    <div className="center-page">
      <div className="auth-card">
        <h1 style={{ textAlign: 'center' }}>QUASTECH OS</h1>
        <p className="muted" style={{ textAlign: 'center' }}>Sign in to continue</p>
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
      </div>
    </div>
  );
}
