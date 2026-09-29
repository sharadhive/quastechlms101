'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { useMe } from '@/lib/client/useMe';
import { Empty, SkelRows } from '@/components/ui';
import CredentialsCard from '@/components/CredentialsCard';

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', BRANCH_ADMIN: 'Branch Admin', INSTRUCTOR: 'Instructor' };

export default function Team() {
  const me = useMe();
  const isSuper = me?.user.role === 'SUPER_ADMIN';
  const [team, setTeam] = useState<any[] | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'INSTRUCTOR', branchId: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [creds, setCreds] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [permPanel, setPermPanel] = useState<any>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  const load = () => { setTeam(null); api('/api/team').then((d) => setTeam(d.team)).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); api('/api/branches').then((d) => setBranches(d.branches)); }, []);
  const bName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const canManage = (t: any) => isSuper || t.role === 'INSTRUCTOR';

  const create = async () => {
    setErr(''); setOk(''); setCreds(null);
    try {
      const d = await api('/api/team', { method: 'POST', json: { ...f, branchId: f.branchId || undefined, phone: f.phone || undefined } });
      setCreds({ ...d.user, password: d.tempPassword });
      setF({ ...f, name: '', email: '', phone: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };
  const reset = async (t: any) => {
    if (!confirm(`Reset the password for ${t.name}? They will get a new temporary password by email.`)) return;
    setErr(''); setCreds(null);
    try { const d = await api(`/api/team/${t.id}/reset-password`, { method: 'POST' }); setCreds({ ...d.user, role: t.role, password: d.tempPassword }); }
    catch (e: any) { setErr(e.message); }
  };
  const saveEdit = async () => {
    setErr('');
    try {
      await api(`/api/team/${editing.id}`, { method: 'PATCH', json: {
        name: editing.name, phone: editing.phone || null, role: editing.role, branchId: editing.branchId || null,
      } });
      setEditing(null); setOk('Saved ✓'); load();
    } catch (e: any) { setErr(e.message); }
  };
  const toggleActive = async (t: any) => {
    if (t.isActive && !confirm(`Deactivate ${t.name}? They are signed out immediately and cannot log in until reactivated.`)) return;
    try { await api(`/api/team/${t.id}`, { method: 'PATCH', json: { isActive: !t.isActive } }); setOk(t.isActive ? `${t.name} deactivated` : `${t.name} reactivated`); load(); }
    catch (e: any) { setErr(e.message); }
  };
  const openPerms = async (u: any) => {
    setErr('');
    try { const d = await api(`/api/team/${u.id}/permissions`); setPermPanel({ user: d.user, catalogue: d.catalogue }); setPerms(d.permissions ?? {}); }
    catch (e: any) { setErr(e.message); }
  };
  const savePerms = async () => {
    try { await api(`/api/team/${permPanel.user.id}/permissions`, { method: 'PATCH', json: { permissions: perms } }); setOk(`Permissions for ${permPanel.user.name} saved ✓`); setPermPanel(null); }
    catch (e: any) { setErr(e.message); }
  };

  const shown = (team ?? []).filter((t) => !roleFilter || t.role === roleFilter);

  return (<>
    <div className="page-head">
      <div>
        <h1>🛡 Team &amp; Instructors</h1>
        <div className="sub">
          {isSuper ? 'As Super Admin you can add admins, branch admins and instructors.' : 'Admins can add and manage instructors. Admin accounts are managed by the Super Admin.'}
        </div>
      </div>
    </div>

    <div className="card">
      <h2>➕ Add team member</h2>
      <div className="row">
        <div><label>Full name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Email (used to log in)</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label>Phone (for WhatsApp sharing)</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Role</label>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="INSTRUCTOR">Instructor — teaches batches</option>
            {isSuper && <option value="BRANCH_ADMIN">Branch Admin — manages one branch</option>}
            {isSuper && <option value="ADMIN">Admin — manages everything</option>}
          </select></div>
        <div><label>Branch {f.role === 'BRANCH_ADMIN' ? '(required)' : '(optional)'}</label>
          <select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
            <option value="">{f.role === 'BRANCH_ADMIN' ? 'Select branch…' : 'All branches'}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.city}, {b.state}</option>)}
          </select></div>
      </div>
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
      {creds && <CredentialsCard name={creds.name} email={creds.email} phone={creds.phone} role={creds.role} password={creds.password} onClose={() => setCreds(null)} />}
      <button className="btn" onClick={create} disabled={!f.name || !f.email || (f.role === 'BRANCH_ADMIN' && !f.branchId)}>Create account</button>
    </div>

    {editing && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><h2>✎ Edit {editing.email}</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Close</button></div>
        <div className="row">
          <div><label>Name</label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><label>Phone</label><input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div><label>Role</label>
            <select value={editing.role} disabled={!isSuper} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              <option value="INSTRUCTOR">Instructor</option><option value="BRANCH_ADMIN">Branch Admin</option><option value="ADMIN">Admin</option>
            </select></div>
          <div><label>Branch</label>
            <select value={editing.branchId ?? ''} onChange={(e) => setEditing({ ...editing, branchId: e.target.value })}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        </div>
        <button className="btn" onClick={saveEdit}>Save changes</button>
      </div>
    )}

    {permPanel && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>🔑 What can {permPanel.user.name} do?</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setPermPanel(null)}>Close</button>
        </div>
        <p className="muted">Always included: their own batches, attendance, evaluations, Q&amp;A, notes and recording uploads. Tick extra abilities:</p>
        {permPanel.catalogue.map((p: any) => (
          <label key={p.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={perms[p.key] === true}
              onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })} />
            <span><b style={{ fontSize: '.88rem' }}>{p.label}</b><div className="muted" style={{ fontSize: '.8rem' }}>{p.help}</div></span>
          </label>
        ))}
        <button className="btn" style={{ marginTop: 12 }} onClick={savePerms}>Save permissions</button>
      </div>
    )}

    <div className="card">
      <div className="filterbar">
        <div className="filter-chips">
          {[['', 'Everyone'], ['INSTRUCTOR', 'Instructors'], ['BRANCH_ADMIN', 'Branch Admins'], ['ADMIN', 'Admins']].map(([v, l]) => (
            <button key={v} className={`filter-chip${roleFilter === v ? ' active' : ''}`} onClick={() => setRoleFilter(v)}>{l}</button>
          ))}
        </div>
        <span className="chip">{shown.length} people</span>
      </div>
      {team === null ? <SkelRows /> : shown.length === 0 ? <Empty icon="👥" text="No team members yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{shown.map((t) => (
            <tr key={t.id} style={t.isActive ? undefined : { opacity: .6 }}>
              <td><b>{t.name}</b><br /><span className="muted" style={{ fontSize: '.8rem' }}>{t.email}{t.phone ? ` · ${t.phone}` : ''}</span></td>
              <td><span className="badge blue">{ROLE_LABEL[t.role] ?? t.role}</span></td>
              <td>{t.branchId ? bName(t.branchId) : <span className="muted">All branches</span>}</td>
              <td>
                <span className={`badge ${t.isActive ? 'green' : 'red'}`}>{t.isActive ? 'Active' : 'Deactivated'}</span>
                {t.isActive && t.mustChangePassword && <><br /><span className="muted" style={{ fontSize: '.74rem' }}>hasn’t set own password yet</span></>}
              </td>
              <td>
                {canManage(t) && me?.user.id !== t.id ? (
                  <div className="actions" style={{ gap: 6 }}>
                    {t.role === 'INSTRUCTOR' && <button className="btn btn-ghost btn-sm" onClick={() => openPerms(t)}>🔑 Permissions</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...t })}>✎ Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => reset(t)}>🔄 Reset password</button>
                    <button className={`btn btn-sm ${t.isActive ? 'btn-danger' : ''}`} onClick={() => toggleActive(t)}>{t.isActive ? 'Deactivate' : 'Reactivate'}</button>
                  </div>
                ) : <span className="muted" style={{ fontSize: '.8rem' }}>{me?.user.id === t.id ? 'you' : 'managed by Super Admin'}</span>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
