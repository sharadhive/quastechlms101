'use client';
import { useEffect, useState } from 'react';
import { api, uploadFile, ACCEPT } from '@/lib/client/api';
import { formatBytes } from '@/lib/utils/files';
import { Empty, SkelRows } from '@/components/ui';
import RecordingPlayer from '@/components/RecordingPlayer';

const STATUS_LABEL: Record<string, [string, string]> = {
  published: ['Visible to students', 'green'],
  pending_approval: ['Waiting for approval', 'amber'],
  hidden: ['Hidden', 'gray'],
};

export default function AdminRecordings() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [batchId, setBatchId] = useState('');
  const [playing, setPlaying] = useState<any>(null);
  const [f, setF] = useState<{ batchId: string; title: string; file?: File }>({ batchId: '', title: '' });
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  const load = () => {
    setRows(null);
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (batchId) p.set('batchId', batchId);
    api(`/api/recordings?${p}`).then((d) => setRows(d.recordings)).catch((e) => { setErr(e.message); setRows([]); });
  };
  useEffect(() => { api('/api/batches').then((d) => setBatches(d.batches)); }, []);
  useEffect(() => { load(); }, [status, batchId]);

  const act = async (fn: () => Promise<any>, msg: string) => {
    setErr(''); setOk('');
    try { await fn(); setOk(msg); load(); } catch (e: any) { setErr(e.message); }
  };
  const upload = async () => {
    setErr(''); setOk('');
    try {
      setPct(0);
      const key = await uploadFile(f.file!, 'recording', setPct);
      await api('/api/recordings', { method: 'POST', json: { batchId: f.batchId, title: f.title, fileKey: key, sizeBytes: f.file!.size } });
      setF({ batchId: '', title: '' }); setOk('Recording uploaded ✓'); load();
    } catch (e: any) { setErr(e.message); } finally { setPct(null); }
  };
  const pending = (rows ?? []).filter((r) => r.status === 'pending_approval').length;

  return (<>
    <div className="page-head">
      <div>
        <h1>🎥 Class Recordings</h1>
        <div className="sub">Recordings of live classes. Students of the batch watch them under “Class Recordings”.</div>
      </div>
    </div>

    <div className="card">
      <h2>Upload a recording</h2>
      <div className="row">
        <div><label>Batch</label>
          <select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>
            <option value="">Select batch…</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.course.title}</option>)}
          </select></div>
        <div><label>Title</label><input placeholder="e.g. Class 12 — React hooks" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      </div>
      <input type="file" accept={ACCEPT.recording} onChange={(e) => setF({ ...f, file: e.target.files?.[0] })} />
      {f.file && <div className="file-pill">📎 {f.file.name} · {formatBytes(f.file.size)}</div>}
      {pct !== null && <div className="upload-bar"><div style={{ width: `${pct}%` }} /></div>}
      <button className="btn" onClick={upload} disabled={!f.batchId || !f.title || !f.file || pct !== null}>
        {pct !== null ? `Uploading ${pct}%…` : 'Upload'}
      </button>
    </div>

    {playing && <RecordingPlayer id={playing.id} title={playing.title} onClose={() => setPlaying(null)} />}

    <div className="card">
      <div className="filterbar">
        <div className="filter-chips">
          {[['', 'All'], ['pending_approval', `⏳ Needs approval${pending && !status ? ` (${pending})` : ''}`], ['published', '✅ Visible'], ['hidden', '🙈 Hidden']].map(([v, l]) => (
            <button key={v} className={`filter-chip${status === v ? ' active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="🎥" text="No recordings here" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Title</th><th>Batch</th><th>Uploaded by</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.title}</b><br /><span className="muted" style={{ fontSize: '.78rem' }}>
                {new Date(r.createdAt).toLocaleString()}{r.sizeBytes ? ` · ${formatBytes(Number(r.sizeBytes))}` : ''}</span></td>
              <td>{r.batch.name}<br /><span className="muted" style={{ fontSize: '.78rem' }}>{r.batch.course.title}</span></td>
              <td>{r.uploadedBy}</td>
              <td><span className={`badge ${STATUS_LABEL[r.status]?.[1] ?? 'gray'}`}>{STATUS_LABEL[r.status]?.[0] ?? r.status}</span></td>
              <td>
                <div className="actions" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPlaying(r)}>▶ Play</button>
                  {r.status !== 'published' && <button className="btn btn-sm" onClick={() => act(() => api(`/api/recordings/${r.id}`, { method: 'PATCH', json: { status: 'published' } }), 'Recording is now visible to students')}>✓ Approve</button>}
                  {r.status === 'published' && <button className="btn btn-ghost btn-sm" onClick={() => act(() => api(`/api/recordings/${r.id}`, { method: 'PATCH', json: { status: 'hidden' } }), 'Recording hidden')}>Hide</button>}
                  <button className="btn btn-danger btn-sm" onClick={() => confirm(`Delete “${r.title}”? The video file is removed too.`) && act(() => api(`/api/recordings/${r.id}`, { method: 'DELETE' }), 'Recording deleted')}>Delete</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
