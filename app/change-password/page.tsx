'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ROLE_HOME } from '@/lib/client/api';
import { clearMe } from '@/lib/client/useMe';

export default function ChangePassword() {
  const router = useRouter();
  const [currentPassword, setCur] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr('');
    if (newPassword !== confirm) { setErr('New passwords do not match'); return; }
    setBusy(true);
    try {
      const res = await api('/api/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } });
      localStorage.setItem('qs_role', res.role);
      clearMe(); localStorage.setItem('qs_name', res.name ?? '');
      router.push(ROLE_HOME[res.role] ?? '/login');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="center-page"><div className="auth-card">
      <h1>Set a new password</h1>
      <p className="muted" style={{ marginTop: 6 }}>For your security, choose your own password before continuing.</p>
      <label>Current / temporary password</label>
      <input type="password" value={currentPassword} onChange={(e) => setCur(e.target.value)} />
      <label>New password (min 8 chars)</label>
      <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
      <label>Confirm new password</label>
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      {err && <div className="err">{err}</div>}
      <button className="btn" style={{ width: '100%' }} onClick={submit} disabled={busy || newPassword.length < 8 || !currentPassword}>
        {busy ? 'Saving…' : 'Update password'}
      </button>
      <p style={{ textAlign: 'center', marginTop: 14 }}>
        <a href="/forgot-password">Don&apos;t know your current password? Reset it with an email code</a>
      </p>
    </div></div>
  );
}
