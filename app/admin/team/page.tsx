'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';

export default function Team() {
  const [team, setTeam] = useState<any[] | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'INSTRUCTOR', branchId: '' });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');

  // instructor permissions panel
  const [permPanel, setPermPanel] = useState<any>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState('');

  const load = () => api('/api/team').then((d) => setTeam(d.team));
  useEffect(() => { load(); api('/api/branches').then((d) => setBranches(d.branches)); }, []);

  const create = async () => {
    setErr(''); setMsg('');
    try {
      await api('/api/team', { method: 'POST', json: { ...f, branchId: f.branchId || undefined, phone: f.phone || undefined } });
      setMsg('Created — login credentials emailed to them.');
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
      {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
      <button className="btn" onClick={create} disabled={!f.name || !f.email}>Create</button>
    </div>

    <div className="card">
      <h2 style={{ marginTop: 0 }}>Team</h2>
      {team === null ? <SkelRows /> : team.length === 0 ? <Empty icon="👥" text="No team members yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Permissions</th></tr></thead>
          <tbody>{team.map((t) => (
            <tr key={t.id}>
              <td><b>{t.name}</b></td>
              <td>{t.email}</td>
              <td><span className="badge blue">{t.role.replace('_', ' ')}</span></td>
              <td>{t.branchId ? bName(t.branchId) : <span className="muted">All branches</span>}</td>
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