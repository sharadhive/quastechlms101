'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Campaigns() {
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]); const [courses, setCourses] = useState<any[]>([]);
  const [f, setF] = useState({ name: '', subject: '', body: '', branchId: '', courseId: '', lifecycle: '' });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = () => api('/api/campaigns').then((d) => setRows(d.campaigns));
  useEffect(() => { load(); api('/api/branches').then((d) => setBranches(d.branches)); api('/api/courses').then((d) => setCourses(d.courses)); }, []);
  const create = async () => {
    setErr(''); setMsg('');
    try {
      const d = await api('/api/campaigns', { method: 'POST', json: {
        name: f.name, subject: f.subject, body: f.body,
        audienceFilter: { ...(f.branchId ? { branchId: f.branchId } : {}), ...(f.courseId ? { courseId: f.courseId } : {}), ...(f.lifecycle ? { lifecycle: f.lifecycle } : {}) },
      } });
      setMsg(`Queued to ${d.recipientCount} recipients.`); load();
    } catch (e: any) { setErr(e.message); }
  };
  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>New email campaign (use {'{{name}}'} for personalization)</h2>
      <div className="row">
        <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Subject</label><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
      </div>
      <label>Body</label><textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <div className="row">
        <div><label>Branch filter</label><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">All</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label>Course filter</label><select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">All</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
        <div><label>Lifecycle</label><select value={f.lifecycle} onChange={(e) => setF({ ...f, lifecycle: e.target.value })}><option value="">All</option><option>ACTIVE</option><option>COMPLETED</option><option>ENROLLED</option><option>LEAD</option></select></div>
      </div>
      {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
      <button className="btn" onClick={create} disabled={!f.name || !f.subject || !f.body}>Queue campaign</button>
    </div>
    <div className="card"><table>
      <thead><tr><th>Name</th><th>Recipients</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>{rows.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.recipientCount}</td>
        <td><span className={`badge ${c.status === 'SENT' ? 'green' : 'amber'}`}>{c.status}</span></td>
        <td>{new Date(c.createdAt).toLocaleString()}</td></tr>)}</tbody>
    </table></div>
  </>);
}
