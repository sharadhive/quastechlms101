'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<any>(null);
  const [f, setF] = useState({ title: '', scheduledAt: '', meetLink: '' });
  const [err, setErr] = useState('');
  const load = () => api(`/api/batches/${id}`).then((d) => setB(d.batch));
  useEffect(() => { load(); }, [id]);
  const createSession = async () => {
    setErr('');
    try {
      await api(`/api/batches/${id}/sessions`, { method: 'POST', json: { title: f.title, scheduledAt: new Date(f.scheduledAt).toISOString(), meetLink: f.meetLink || undefined } });
      setF({ title: '', scheduledAt: '', meetLink: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };
  if (!b) return <p className="muted">Loading…</p>;
  return (<>
    <div className="card"><h2 style={{ marginTop: 0 }}>{b.name} — {b.course.title}</h2>
      <p className="muted">Starts {new Date(b.startDate).toDateString()} · {b.enrollments.length} learners</p></div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Schedule session (reminders auto-queued T-24h & T-1h)</h2>
      <div className="row">
        <div><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label>Date & time</label><input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></div>
        <div><label>Meet link (paste Zoom/Meet)</label><input value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} /></div>
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn" onClick={createSession} disabled={!f.title || !f.scheduledAt}>Create session</button>
    </div>
    <div className="card"><h2 style={{ marginTop: 0 }}>Sessions</h2><table>
      <thead><tr><th>Title</th><th>Scheduled</th><th>Status</th></tr></thead>
      <tbody>{b.sessions.map((s: any) => <tr key={s.id}>
        <td>{s.title}</td><td>{new Date(s.scheduledAt).toLocaleString()}</td>
        <td>{s.startedAt ? <span className="badge green">held</span> : <span className="badge gray">scheduled</span>}</td>
      </tr>)}</tbody></table></div>
    <div className="card"><h2 style={{ marginTop: 0 }}>Roster</h2><table>
      <thead><tr><th>Name</th><th>Email</th><th>Progress</th></tr></thead>
      <tbody>{b.enrollments.map((e: any) => <tr key={e.id}>
        <td>{e.learner.name}</td><td>{e.learner.email}</td><td>{e.progressPct}%</td>
      </tr>)}</tbody></table></div>
  </>);
}
