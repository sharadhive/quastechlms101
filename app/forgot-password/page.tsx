'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ROLE_HOME } from '@/lib/client/api';
import { clearMe } from '@/lib/client/useMe';

/** Forgot password: email → 6-digit code → new password → signed in. */
export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email');
    if (e) setEmail(e);
  }, []);

  const sendCode = async () => {
    setErr(''); setBusy(true);
    try {
      await api('/api/auth/otp/request', { method: 'POST', json: { email, purpose: 'RESET' } });
      setSent(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const reset = async () => {
    setErr('');
    if (pwd !== pwd2) { setErr('Passwords do not match'); return; }
    setBusy(true);
    try {
      const res = await api('/api/auth/password/reset', { method: 'POST', json: { email, code, newPassword: pwd } });
      localStorage.setItem('qs_role', res.role);
      clearMe(); localStorage.setItem('qs_name', res.name ?? '');
      router.push(ROLE_HOME[res.role] ?? '/');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="center-page"><div className="auth-card">
      <h1>Reset your password</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        {sent ? `If ${email} has an account, a 6-digit code was sent to it. It is valid for 10 minutes.`
          : 'Enter your account email. We will send you a code to set a new password.'}
      </p>
      <label>Email</label>
      <input type="email" value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      {sent && (<>
        <label>6-digit code</label>
        <input value={code} maxLength={6} inputMode="numeric" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <label>New password (min 8 characters)</label>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <label>Confirm new password</label>
        <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reset()} />
      </>)}
      {err && <div className="err">{err}</div>}
      {!sent ? (
        <button className="btn" style={{ width: '100%' }} disabled={busy || !email.includes('@')} onClick={sendCode}>
          {busy ? 'Sending…' : 'Send code'}
        </button>
      ) : (
        <button className="btn" style={{ width: '100%' }} disabled={busy || code.length !== 6 || pwd.length < 8} onClick={reset}>
          {busy ? 'Saving…' : 'Set new password & sign in'}
        </button>
      )}
      <p style={{ textAlign: 'center', marginTop: 14 }}>
        {sent && <><a href="#" onClick={(e) => { e.preventDefault(); sendCode(); }}>Resend code</a> · </>}
        <a href="/login">Back to login</a>
      </p>
    </div></div>
  );
}
