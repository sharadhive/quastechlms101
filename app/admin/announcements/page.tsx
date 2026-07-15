'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';

export default function Announcements() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [courses, setCourses] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]);
  const [f, setF] = useState({ title: '', message: '', audience: 'ALL', courseId: '', batchId: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const load = () => api('/api/announcements').then((d) => setRows(d.announcements));
  useEffect(() => {
    load();
    api('/api/courses').then((d) => setCourses(d.courses));
    api('/api/batches').then((d) => setBatches(d.batches));
  }, []);
  const create = async () => {
    setErr(''); setOk('');
    try {
      await api('/api/announcements', { method: 'POST', json: {
        title: f.title, message: f.message, audience: f.audience,
        courseId: f.audience === 'COURSE' ? f.courseId : undefined,
        batchId: f.audience === 'BATCH' ? f.batchId : undefined,
      }});
      setOk('Announcement published.'); setF({ title: '', message: '', audience: 'ALL', courseId: '', batchId: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };
  return (<>
    <div className="card">
      <h2>📣 New announcement</h2>
      <div className="row">
        <div><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label>Audience</label><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
          <option value="ALL">Everyone</option><option value="COURSE">A specific course</option><option value="BATCH">A specific batch</option>
        </select></div>
        {f.audience === 'COURSE' && <div><label>Course</label><select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
          <option value="">Select…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>}
        {f.audience === 'BATCH' && <div><label>Batch</label><select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>
          <option value="">Select…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
      </div>
      <label>Message</label><textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
      <button className="btn" onClick={create} disabled={!f.title || !f.message}>Publish</button>
    </div>
    <div className="card">
      <h2>Recent announcements</h2>
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="📣" text="Nothing announced yet" /> : rows.map((a) => (
        <div key={a.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
          <b>{a.title}</b> <span className={`badge ${a.audience === 'ALL' ? 'blue' : 'gray'}`}>{a.audience}</span>
          <p className="muted" style={{ margin: '6px 0 2px' }}>{a.message}</p>
          <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  </>);
}
