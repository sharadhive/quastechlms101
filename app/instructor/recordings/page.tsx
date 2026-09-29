'use client';
import { useEffect, useState } from 'react';
import { api, uploadFile, ACCEPT } from '@/lib/client/api';
import { useMe } from '@/lib/client/useMe';
import { formatBytes } from '@/lib/utils/files';
import { Empty } from '@/components/ui';
import RecordingPlayer from '@/components/RecordingPlayer';

const STATUS_LABEL: Record<string, [string, string]> = {
  published: ['Visible to students', 'green'],
  pending_approval: ['Waiting for admin approval', 'amber'],
  hidden: ['Hidden by admin', 'gray'],
};

export default function Recordings() {
  const me = useMe();
  const [batches, setBatches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState<{ batchId: string; title: string; file?: File }>({ batchId: '', title: '' });
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [playing, setPlaying] = useState<any>(null);
  const load = () => api('/api/recordings').then((d) => setRows(d.recordings));
  useEffect(() => { load(); api('/api/batches').then((d) => setBatches(d.batches)); }, []);

  const upload = async () => {
    setErr(''); setOk('');
    try {
      setPct(0);
      const key = await uploadFile(f.file!, 'recording', setPct);
      const d = await api('/api/recordings', { method: 'POST', json: { batchId: f.batchId, title: f.title, fileKey: key, sizeBytes: f.file!.size } });
      setF({ batchId: '', title: '' });
      setOk(d.recording.status === 'published' ? 'Uploaded ✓ — students can watch it now.' : 'Uploaded ✓ — it will be visible once an admin approves it.');
      load();
    } catch (e: any) { setErr(e.message); } finally { setPct(null); }
  };
  const remove = async (r: any) => {
    if (!confirm(`Delete “${r.title}”?`)) return;
    try { await api(`/api/recordings/${r.id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); }
  };

  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>🎥 Upload a class recording</h2>
      {me && !me.permissions.publish_recordings && (
        <div className="hint">Your uploads are checked by an admin before students can see them.</div>
      )}
      <div className="row">
        <div><label>Batch</label>
          <select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>
            <option value="">Select batch…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.course.title}</option>)}
          </select></div>
        <div><label>Title</label><input placeholder="e.g. Class 12 — React hooks" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      </div>
      <input type="file" accept={ACCEPT.recording} onChange={(e) => setF({ ...f, file: e.target.files?.[0] })} />
      {f.file && <div className="file-pill">📎 {f.file.name} · {formatBytes(f.file.size)}</div>}
      {pct !== null && (<>
        <div className="upload-bar"><div style={{ width: `${pct}%` }} /></div>
        <div className="muted" style={{ fontSize: '.8rem' }}>Large files upload in parts and resume automatically — keep this tab open.</div>
      </>)}
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
      <button className="btn" onClick={upload} disabled={!f.batchId || !f.title || !f.file || pct !== null}>{pct !== null ? `Uploading ${pct}%…` : 'Upload'}</button>
    </div>
    {playing && <RecordingPlayer id={playing.id} title={playing.title} onClose={() => setPlaying(null)} />}
    <div className="card">
      {rows.length === 0 ? <Empty icon="🎥" text="No recordings uploaded yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Title</th><th>Batch</th><th>Status</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><b>{r.title}</b></td>
            <td>{r.batch?.name}</td>
            <td><span className={`badge ${STATUS_LABEL[r.status]?.[1] ?? 'gray'}`}>{STATUS_LABEL[r.status]?.[0] ?? r.status}</span></td>
            <td>{new Date(r.createdAt).toLocaleString()}</td>
            <td><div className="actions" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPlaying(r)}>▶ Play</button>
              {me && r.uploadedById === me.user.id && <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button>}
            </div></td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
