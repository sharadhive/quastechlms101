'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ROLE_HOME } from '@/lib/client/api';

export default function ChangePassword() {
  const router = useRouter();
  const [currentPassword, setCur] = useState('');
  const [newPassword, setNew] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try {
      await api('/api/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } });
      router.push(ROLE_HOME[localStorage.getItem('qs_role') ?? ''] ?? '/login');
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="center-page"><div className="auth-card">
      <h1>Set a new password</h1>
      <label>Current / temporary password</label>
      <input type="password" value={currentPassword} onChange={(e) => setCur(e.target.value)} />
      <label>New password (min 8 chars)</label>
      <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
      {err && <div className="err">{err}</div>}
      <button className="btn" style={{ width: '100%' }} onClick={submit} disabled={newPassword.length < 8}>Update password</button>
    </div></div>
  );
}
