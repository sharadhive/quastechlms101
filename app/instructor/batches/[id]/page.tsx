'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';

export default function InstructorBatch() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<any>(null);
  const [openSession, setOpenSession] = useState('');
  const [roster, setRoster] = useState<any[]>([]);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [f, setF] = useState({ title: '', scheduledAt: '', meetLink: '' });

  const load = () => api(`/api/batches/${id}`).then((d) => setB(d.batch));
  useEffect(() => { load(); }, [id]);

  const openAttendance = async (sessionId: string) => {
    setOpenSession(sessionId); setMsg(''); setErr('');
    const d = await api(`/api/sessions/${sessionId}/attendance`);
    setRoster(d.roster.map((r: any) => ({ ...r, present: r.present ?? true }))); // bulk mark-present default
  };
  const save = async () => {
    setErr('');
    try {
      await api(`/api/sessions/${openSession}/attendance`, {
        method: 'POST',
        json: { marks: roster.map((r) => ({ learnerId: r.id, present: r.present })) },
      });
      setMsg('Attendance saved.');
    } catch (e: any) { setErr(e.message); }
  };
  const createSession = async () => {
    await api(`/api/batches/${id}/sessions`, { method: 'POST', json: { title: f.title, scheduledAt: new Date(f.scheduledAt).toISOString(), meetLink: f.meetLink || undefined } });
    setF({ title: '', scheduledAt: '', meetLink: '' }); load();
  };

  if (!b) return <p className="muted">Loading…</p>;
  return (<>
    <div className="card"><h2 style={{ marginTop: 0 }}>{b.name} — {b.course.title}</h2></div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Schedule session</h2>
      <div className="row">
        <input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} />
        <input placeholder="Meet link" value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} />
        <button className="btn" style={{ flex: '0 0 auto' }} onClick={createSession} disabled={!f.title || !f.scheduledAt}>Add</button>
      </div>
    </div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Sessions — click to mark attendance</h2>
      <table><tbody>{b.sessions.map((s: any) => <tr key={s.id}>
        <td><a href="#" onClick={(e) => { e.preventDefault(); openAttendance(s.id); }}>{s.title}</a></td>
        <td>{new Date(s.scheduledAt).toLocaleString()}</td>
      </tr>)}</tbody></table>
    </div>
    {openSession && (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Mark attendance (untick absentees)</h2>
        {roster.map((r) => (
          <p key={r.id}><label style={{ fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto', marginRight: 10 }} checked={r.present}
              onChange={(e) => setRoster(roster.map((x) => x.id === r.id ? { ...x, present: e.target.checked } : x))} />
            {r.name} <span className="muted">({r.email})</span>
          </label></p>
        ))}
        {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
        <button className="btn" onClick={save}>Save attendance</button>
      </div>
    )}
  </>);
}
