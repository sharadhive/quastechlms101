'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function AdminSettings() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState('');

  const flash = (setter: (v: string) => void, m: string) => { setter(m); setTimeout(() => setter(''), 5000); };

  const load = async () => {
    try {
      const d = await api('/api/auth/profile');
      setUser(d.user);
      setForm({ name: d.user.name, email: d.user.email, phone: d.user.phone || '' });
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    setErr(''); setSaving(true);
    try {
      const json: any = {};
      if (form.name !== user.name) json.name = form.name;
      if (form.email !== user.email) json.email = form.email;
      if ((form.phone || null) !== (user.phone || null)) json.phone = form.phone || null;
      if (Object.keys(json).length === 0) { flash(setOk, 'No changes to save'); setSaving(false); return; }
      await api('/api/auth/profile', { method: 'PATCH', json });
      flash(setOk, 'Profile updated ✓');
      // If email changed, cookies got refreshed by the server — update localStorage too
      if (json.name) { try { localStorage.setItem('qs_name', json.name); } catch {} }
      load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const changePassword = async () => {
    setPwErr('');
    if (pw.newPassword.length < 8) { setPwErr('New password must be at least 8 characters'); return; }
    if (pw.newPassword !== pw.confirm) { setPwErr('Passwords do not match'); return; }
    setSaving(true);
    try {
      await api('/api/auth/profile', { method: 'PATCH', json: {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      }});
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      flash(setPwOk, 'Password changed ✓');
    } catch (e: any) { setPwErr(e.message); } finally { setSaving(false); }
  };

  if (!user) return <div className="card"><p className="muted">Loading…</p></div>;

  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>👤 My Profile</h2>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Role: <b>{user.role.replace(/_/g, ' ')}</b> · Organisation: <b>{user.organization?.name || '—'}</b>
      </p>
      {err && <div className="err">⚠ {err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <div className="grid grid-2" style={{ maxWidth: 700, alignItems: 'start' }}>
        <div>
          <label>Full name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label>Email address</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label>Phone (optional)</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 ..." />
        </div>
      </div>
      <button className="btn" onClick={saveProfile} disabled={saving || !form.name || !form.email} style={{ marginTop: 12 }}>
        {saving ? 'Saving…' : '💾 Save profile'}
      </button>
    </div>

    <div className="card">
      <h2 style={{ marginTop: 0 }}>🔒 Change Password</h2>
      {pwErr && <div className="err">⚠ {pwErr}</div>}
      {pwOk && <div className="ok">{pwOk}</div>}
      <div className="grid grid-3" style={{ maxWidth: 700 }}>
        <div>
          <label>Current password</label>
          <input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        </div>
        <div>
          <label>New password</label>
          <input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        </div>
        <div>
          <label>Confirm new password</label>
          <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </div>
      </div>
      <button className="btn" onClick={changePassword}
        disabled={saving || !pw.currentPassword || !pw.newPassword || !pw.confirm}
        style={{ marginTop: 12 }}>
        {saving ? 'Changing…' : '🔑 Change password'}
      </button>
    </div>

    <div className="card" style={{ borderColor: '#fbd38d' }}>
      <h2 style={{ marginTop: 0 }}>ℹ️ Account info</h2>
      <table>
        <tbody>
          <tr><td className="muted" style={{ paddingRight: 24 }}>User ID</td><td><code style={{ fontSize: '.8rem' }}>{user.id}</code></td></tr>
          <tr><td className="muted" style={{ paddingRight: 24 }}>Role</td><td>{user.role.replace(/_/g, ' ')}</td></tr>
          <tr><td className="muted" style={{ paddingRight: 24 }}>Organisation</td><td>{user.organization?.name}</td></tr>
          <tr><td className="muted" style={{ paddingRight: 24 }}>Joined</td><td>{new Date(user.createdAt).toLocaleDateString()}</td></tr>
        </tbody>
      </table>
    </div>
  </>);
}
