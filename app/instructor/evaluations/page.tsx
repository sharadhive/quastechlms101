'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Evaluations() {
  const [queue, setQueue] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [marks, setMarks] = useState(''); const [feedback, setFeedback] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = () => api('/api/evaluations/queue').then((d) => setQueue(d.queue));
  useEffect(() => { load(); }, []);
  const openSub = async (s: any) => {
    setOpen(s); setMsg(''); setErr(''); setMarks(''); setFeedback('');
    const d = await api(`/api/submissions/${s.id}/evaluate`);
    setFileUrl(d.fileUrl);
  };
  const evaluate = async () => {
    setErr('');
    try {
      await api(`/api/submissions/${open.id}/evaluate`, { method: 'POST', json: { marks: Number(marks), feedback: feedback || undefined } });
      await api(`/api/submissions/${open.id}/publish`, { method: 'POST' });
      setMsg('Evaluated & published — learner notified.'); setOpen(null); load();
    } catch (e: any) { setErr(e.message); }
  };
  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Pending ({queue.length}) — oldest first</h2>
      <table><thead><tr><th>Learner</th><th>Assessment</th><th>Submitted</th><th></th><th></th></tr></thead>
      <tbody>{queue.map((s) => <tr key={s.id}>
        <td>{s.learner?.name}</td><td>{s.material.title}</td>
        <td>{new Date(s.createdAt).toLocaleString()} {s.isLate && <span className="badge amber">LATE</span>}</td>
        <td></td><td><button className="btn btn-sm" onClick={() => openSub(s)}>Evaluate</button></td>
      </tr>)}</tbody></table>
    </div>
    {open && (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Evaluating: {open.material.title} — {open.learner?.name}</h2>
        {fileUrl && <p><a href={fileUrl} target="_blank">📄 View submitted file</a></p>}
        <div className="row">
          <div><label>Marks</label><input type="number" value={marks} onChange={(e) => setMarks(e.target.value)} /></div>
        </div>
        <label>Feedback</label><textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        {err && <div className="err">{err}</div>}
        <button className="btn" onClick={evaluate} disabled={marks === ''}>Save & publish result</button>
      </div>
    )}
    {msg && <div className="card ok">{msg}</div>}
  </>);
}
