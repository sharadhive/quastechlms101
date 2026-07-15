'use client';
import { useEffect, useState } from 'react';
import { api, uploadFile } from '@/lib/client/api';

export default function Recordings() {
  const [batches, setBatches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState<{ batchId: string; title: string; file?: File }>({ batchId: '', title: '' });
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = () => api('/api/recordings').then((d) => setRows(d.recordings));
  useEffect(() => { load(); api('/api/batches').then((d) => setBatches(d.batches)); }, []);
  const upload = async () => {
    setErr('');
    try {
      const key = await uploadFile(f.file!, 'recording', (p) => setBusy(`${p}%`));
      await api('/api/recordings', { method: 'POST', json: { batchId: f.batchId, title: f.title, fileKey: key, sizeBytes: f.file!.size } });
      setF({ batchId: '', title: '' }); setBusy(''); load();
    } catch (e: any) { setErr(e.message); setBusy(''); }
  };
  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Upload recording (chunk-safe, direct to storage)</h2>
      <div className="row">
        <select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>
          <option value="">Batch…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <input type="file" accept="video/*" onChange={(e) => setF({ ...f, file: e.target.files?.[0] })} />
      {err && <div className="err">{err}</div>}
      <button className="btn" onClick={upload} disabled={!f.batchId || !f.title || !f.file || !!busy}>{busy ? `Uploading ${busy}` : 'Upload'}</button>
    </div>
    <div className="card"><table>
      <thead><tr><th>Title</th><th>Status</th><th>Uploaded</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.title}</td>
        <td><span className={`badge ${r.status === 'published' ? 'green' : 'amber'}`}>{r.status}</span></td>
        <td>{new Date(r.createdAt).toLocaleString()}</td></tr>)}</tbody>
    </table></div>
  </>);
}
