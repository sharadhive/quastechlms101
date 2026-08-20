'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Empty, SkelRows, GeoFilter, geoQuery } from '@/components/ui';

const LIFECYCLES = ['', 'LEAD', 'ENQUIRY', 'ENROLLED', 'ACTIVE', 'COMPLETED', 'DROPPED'];

/** Tiny eye-toggle password cell */
function PasswordCell({ user, onReset }: { user: any; onReset: (u: any) => void }) {
  const [show, setShow] = useState(false);
  const [resetting, setResetting] = useState(false);
  const pwd = (user.profile as any)?.tempPassword;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard ✓');
  };

  const copyCredentials = () => {
    const text = `🎓 QUASTECH Login Credentials\n\nName: ${user.name}\nEmail: ${user.email}\nPassword: ${pwd}\nLogin: ${window.location.origin}/login\n\nPlease change your password after first login.`;
    navigator.clipboard.writeText(text);
    alert('Credentials copied to clipboard ✓');
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `🎓 *QUASTECH Login Credentials*\n\nHi ${user.name},\n\n📧 Email: ${user.email}\n🔑 Password: ${pwd}\n🌐 Login: ${window.location.origin}/login\n\n_Please change your password after first login._`
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
      const d = await api(`/api/learners/${user.id}/reset-password`, { method: 'POST' });
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

export default function Learners() {
  const [q, setQ] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [geo, setGeo] = useState({ state: '', city: '', branchId: '' });
  const [branches, setBranches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const load = () => {
    setRows(null);
    return api(`/api/learners?${geoQuery(geo, { q, lifecycle })}`)
      .then((d) => { setRows(d.learners); setTotal(d.total); });
  };
  useEffect(() => { api('/api/branches').then((d) => setBranches(d.branches)); }, []);
  useEffect(() => { load(); }, [geo.state, geo.city, geo.branchId, lifecycle]);

  const bInfo = (id: string) => branches.find((b) => b.id === id);

  const updateRow = (updated: any) => {
    setRows((prev) => prev?.map((r) => r.id === updated.id ? { ...r, ...updated } : r) ?? null);
  };

  const create = async () => {
    setErr(''); setMsg(''); setNewPwd('');
    try {
      const d = await api('/api/learners', { method: 'POST', json: { ...f, phone: f.phone || undefined } });
      const pwd = d.tempPassword || (d.learner?.profile as any)?.tempPassword || '';
      setMsg(`✅ Learner "${d.learner.name}" created successfully!`);
      setNewPwd(pwd);
      setF({ name: '', email: '', phone: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };

  const copyNewCredentials = (email: string, name: string) => {
    const text = `🎓 QUASTECH Login Credentials\n\nName: ${name}\nEmail: ${email}\nPassword: ${newPwd}\nLogin: ${window.location.origin}/login\n\nPlease change your password after first login.`;
    navigator.clipboard.writeText(text);
    alert('Credentials copied ✓');
  };

  return (<>
    <div className="card">
      <div className="filterbar">
        <input className="grow" placeholder="🔍  Search name / email / phone…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <GeoFilter value={geo} onChange={setGeo} />
        <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
          {LIFECYCLES.map((l) => <option key={l} value={l}>{l || 'All lifecycles'}</option>)}
        </select>
        <button className="btn" onClick={load}>Search</button>
        <span className="chip">{total} learners</span>
      </div>
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="🧑‍🎓" text="No learners match these filters" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Branch</th><th>City / State</th><th>Lifecycle</th><th>Password</th><th></th></tr></thead>
          <tbody>{rows.map((l) => {
            const b = bInfo(l.branchId);
            return (
              <tr key={l.id}>
                <td><b>{l.name}</b></td>
                <td>{l.email}<br /><span className="muted">{l.phone ?? '—'}</span></td>
                <td>{b?.name ?? '—'}</td>
                <td>{b ? <span className="badge blue">{b.city}, {b.state}</span> : '—'}</td>
                <td><span className={`badge ${l.lifecycle === 'ACTIVE' ? 'green' : l.lifecycle === 'DROPPED' ? 'red' : 'gray'}`}>{l.lifecycle ?? '—'}</span></td>
                <td><PasswordCell user={l} onReset={updateRow} /></td>
                <td><Link href={`/admin/learners/${l.id}`}>View →</Link></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>

    <div className="card">
      <h2>Quick add learner</h2>
      <div className="row">
        <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      {err && <div className="err">{err}</div>}
      {msg && (
        <div className="ok" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{msg}</span>
          {newPwd && (
            <div style={{ background: '#fff', border: '2px dashed #4caf50', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>🔑 Temp Password: <code style={{ fontSize: 15, fontWeight: 700, color: '#1b5e20', letterSpacing: 1 }}>{newPwd}</code></span>
              <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => { navigator.clipboard.writeText(newPwd); alert('Password copied ✓'); }}>📋 Copy</button>
              <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => copyNewCredentials(f.email || '(last created)', f.name || '(last created)')}>📄 Copy Credentials</button>
            </div>
          )}
        </div>
      )}
      <button className="btn" onClick={create} disabled={!f.name || !f.email}>Create learner</button>
    </div>
  </>);
}
