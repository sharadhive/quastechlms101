'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';

/** Tiny eye-toggle password cell for team members */
function PasswordCell({ user, onReset }: { user: any; onReset: (u: any) => void }) {
  const [show, setShow] = useState(false);
  const [resetting, setResetting] = useState(false);
  const pwd = (user.profile as any)?.tempPassword;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard ✓');
  };

  const copyCredentials = () => {
    const text = `🎓 QUASTECH Login Credentials\n\nName: ${user.name}\nEmail: ${user.email}\nRole: ${user.role.replace('_', ' ')}\nPassword: ${pwd}\nLogin: ${window.location.origin}/login\n\nPlease change your password after first login.`;
    navigator.clipboard.writeText(text);
    alert('Credentials copied to clipboard ✓');
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `🎓 *QUASTECH Login Credentials*\n\nHi ${user.name},\n\n📧 Email: ${user.email}\n👤 Role: ${user.role.replace('_', ' ')}\n🔑 Password: ${pwd}\n🌐 Login: ${window.location.origin}/login\n\n_Please change your password after first login._`
    );
    const phone = user.phone?.replace(/\D/g, '');
    const url = phone
      ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const resetPassword = async () => {
    if (!confirm(`Reset password for ${user.name}? A new temporary password will be generated.`)) return;
    setResetting(true);
    try {
      const d = await api(`/api/team/${user.id}/reset-password`, { method: 'POST' });
      onReset({ ...user, profile: { ...(user.profile ?? {}), tempPassword: d.tempPassword } });
      setShow(true);
      alert(`New password: ${d.tempPassword}`);
    } catch (e: any) { alert(e.message); }
    finally { setResetting(false); }
  };

  if (!pwd) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>No password stored</span>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={resetPassword} disabled={resetting}>
          {resetting ? '…' : '🔄 Reset'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <code style={{ fontSize: 13, background: 'var(--brand-50)', padding: '2px 6px', borderRadius: 4, letterSpacing: show ? 0 : 3 }}>
        {show ? pwd : '••••••••'}
      </code>
      <button className="iconbtn" onClick={() => setShow(!show)} title={show ? 'Hide' : 'Show password'}
        style={{ fontSize: 15, width: 28, height: 28 }}>
        {show ? '🙈' : '👁'}
      </button>
      {show && <>
        <button className="iconbtn" onClick={() => copy(pwd)} title="Copy password"
          style={{ fontSize: 13, width: 28, height: 28 }}>📋</button>
        <button className="iconbtn" onClick={copyCredentials} title="Copy full credentials"
          style={{ fontSize: 13, width: 28, height: 28 }}>📄</button>
        <button className="iconbtn" onClick={shareWhatsApp} title="Share via WhatsApp"
          style={{ fontSize: 13, width: 28, height: 28 }}>💬</button>
      </>}
      <button className="iconbtn" onClick={resetPassword} title="Reset password"
        disabled={resetting}
        style={{ fontSize: 13, width: 28, height: 28 }}>
        {resetting ? '⏳' : '🔄'}
      </button>
    </div>
  );
}

export default function Team() {
  const [team, setTeam] = useState<any[] | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'INSTRUCTOR', branchId: '' });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [newPwd, setNewPwd] = useState('');

  // instructor permissions panel
  const [permPanel, setPermPanel] = useState<any>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState('');

  const load = () => { setTeam(null); api('/api/team').then((d) => setTeam(d.team)); };
  useEffect(() => { load(); api('/api/branches').then((d) => setBranches(d.branches)); }, []);

  const updateRow = (updated: any) => {
    setTeam((prev) => prev?.map((r) => r.id === updated.id ? { ...r, ...updated } : r) ?? null);
  };

  const create = async () => {
    setErr(''); setMsg(''); setNewPwd('');
    try {
      const d = await api('/api/team', { method: 'POST', json: { ...f, branchId: f.branchId || undefined, phone: f.phone || undefined } });
      const pwd = d.tempPassword || (d.user?.profile as any)?.tempPassword || '';
      setMsg(`✅ ${f.role.replace('_', ' ')} "${d.user.name}" created successfully!`);
      setNewPwd(pwd);
      setF({ ...f, name: '', email: '', phone: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };

  const openPerms = async (u: any) => {
    setSavedMsg(''); setErr('');
    try {
      const d = await api(`/api/team/${u.id}/permissions`);
      setPermPanel({ user: d.user, catalogue: d.catalogue });
      setPerms(d.permissions ?? {});
    } catch (e: any) { setErr(e.message); }
  };

  const savePerms = async () => {
    try {
      await api(`/api/team/${permPanel.user.id}/permissions`, { method: 'PATCH', json: { permissions: perms } });
      setSavedMsg('Permissions updated ✓ — they take effect immediately.');
    } catch (e: any) { setErr(e.message); }
  };

  const bName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const copyNewCredentials = () => {
    const text = `🎓 QUASTECH Login Credentials\n\nName: ${f.name || '(last created)'}\nEmail: ${f.email || '(last created)'}\nRole: ${f.role.replace('_', ' ')}\nPassword: ${newPwd}\nLogin: ${window.location.origin}/login\n\nPlease change your password after first login.`;
    navigator.clipboard.writeText(text);
    alert('Credentials copied ✓');
  };

  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>➕ Add team member</h2>
      <div className="row">
        <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Role</label>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="INSTRUCTOR">Instructor</option>
            <option value="BRANCH_ADMIN">Branch Admin</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div><label>Branch</label>
          <select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
            <option value="">Select branch…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.city}, {b.state}</option>)}
          </select>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      {msg && (
        <div className="ok" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{msg}</span>
          {newPwd && (
            <div style={{ background: '#fff', border: '2px dashed #4caf50', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>🔑 Temp Password: <code style={{ fontSize: 15, fontWeight: 700, color: '#1b5e20', letterSpacing: 1 }}>{newPwd}</code></span>
              <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => { navigator.clipboard.writeText(newPwd); alert('Password copied ✓'); }}>📋 Copy</button>
              <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={copyNewCredentials}>📄 Copy Credentials</button>
            </div>
          )}
        </div>
      )}
      <button className="btn" onClick={create} disabled={!f.name || !f.email}>Create</button>
    </div>

    <div className="card">
      <h2 style={{ marginTop: 0 }}>Team</h2>
      {team === null ? <SkelRows /> : team.length === 0 ? <Empty icon="👥" text="No team members yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Password</th><th>Status</th><th>Permissions</th></tr></thead>
          <tbody>{team.map((t) => (
            <tr key={t.id}>
              <td><b>{t.name}</b></td>
              <td>{t.email}</td>
              <td><span className="badge blue">{t.role.replace('_', ' ')}</span></td>
              <td>{t.branchId ? bName(t.branchId) : <span className="muted">All branches</span>}</td>
              <td><PasswordCell user={t} onReset={updateRow} /></td>
              <td><span className={`badge ${t.isActive ? 'green' : 'red'}`}>{t.isActive ? 'Active' : 'Inactive'}</span></td>
              <td>{t.role === 'INSTRUCTOR'
                ? <button className="btn btn-ghost btn-sm" onClick={() => openPerms(t)}>🔑 Manage</button>
                : <span className="muted">full access</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>

    {permPanel && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>🔑 Permissions — {permPanel.user.name}</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setPermPanel(null)}>Close</button>
        </div>
        <p className="muted">
          Instructors always get their own batches, attendance, evaluations, Q&amp;A and recordings.
          Tick any extra capability below to grant it.
        </p>
        {permPanel.catalogue.map((p: any) => (
          <label key={p.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto', marginTop: 4 }}
              checked={perms[p.key] === true}
              onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })} />
            <span>
              <b style={{ fontSize: '.88rem' }}>{p.label}</b>
              <div className="muted" style={{ fontSize: '.8rem' }}>{p.help}</div>
            </span>
          </label>
        ))}
        {savedMsg && <div className="ok">{savedMsg}</div>}
        <button className="btn" style={{ marginTop: 12 }} onClick={savePerms}>Save permissions</button>
      </div>
    )}
  </>);
}