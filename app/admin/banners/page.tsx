'use client';
import { useEffect, useState } from 'react';
import { api, uploadFile } from '@/lib/client/api';

export default function Banners() {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState<{ title: string; link: string; file?: File }>({ title: '', link: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = () => api('/api/banners').then((d) => setRows(d.banners));
  useEffect(() => { load(); }, []);
  const create = async () => {
    setErr(''); setBusy(true);
    try {
      const imageKey = await uploadFile(f.file!, 'banner');
      await api('/api/banners', { method: 'POST', json: { title: f.title, imageKey, link: f.link || undefined, position: rows.length } });
      setF({ title: '', link: '' }); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Add banner</h2>
      <div className="row">
        <div><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label>Link (optional)</label><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></div>
      </div>
      <input type="file" accept="image/*" onChange={(e) => setF({ ...f, file: e.target.files?.[0] })} />
      {err && <div className="err">{err}</div>}
      <button className="btn" onClick={create} disabled={!f.title || !f.file || busy}>{busy ? 'Uploading…' : 'Create banner'}</button>
    </div>
    <div className="grid grid-4">
      {rows.map((b) => <div className="card" key={b.id}>
        <img src={b.imageUrl} alt={b.title} style={{ width: '100%', borderRadius: 8 }} />
        <p><b>{b.title}</b></p>
      </div>)}
    </div>
  </>);
}
