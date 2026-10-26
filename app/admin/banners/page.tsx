'use client';
import { useEffect, useState } from 'react';
import { api, uploadFile } from '@/lib/client/api';

export default function Banners() {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState<{ title: string; link: string; file?: File }>({ title: '', link: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; link: string; isActive: boolean }>({ title: '', link: '', isActive: true });

  const flash = (m: string) => { setOk(m); setErr(''); setTimeout(() => setOk(''), 4000); };
  const load = () => api('/api/banners').then((d) => setRows(d.banners)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr(''); setBusy(true);
    try {
      const imageKey = await uploadFile(f.file!, 'banner');
      await api('/api/banners', { method: 'POST', json: { title: f.title, imageKey, link: f.link || undefined, position: rows.length } });
      setF({ title: '', link: '' }); flash('Banner created ✓'); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const deleteBanner = async (id: string, title: string) => {
    if (!confirm(`Delete banner "${title}" permanently? The image will also be removed.`)) return;
    setErr('');
    try {
      await api(`/api/banners/${id}`, { method: 'DELETE' });
      flash('Banner deleted ✓'); load();
    } catch (e: any) { setErr(e.message); }
  };

  const startEdit = (b: any) => {
    setEditing(b.id);
    setEditForm({ title: b.title, link: b.link || '', isActive: b.isActive });
  };

  const saveEdit = async (id: string) => {
    setErr('');
    try {
      await api(`/api/banners/${id}`, { method: 'PATCH', json: {
        title: editForm.title,
        link: editForm.link || null,
        isActive: editForm.isActive,
      }});
      setEditing(null); flash('Banner updated ✓'); load();
    } catch (e: any) { setErr(e.message); }
  };

  const toggleActive = async (b: any) => {
    setErr('');
    try {
      await api(`/api/banners/${b.id}`, { method: 'PATCH', json: { isActive: !b.isActive } });
      flash(b.isActive ? 'Banner hidden' : 'Banner visible'); load();
    } catch (e: any) { setErr(e.message); }
  };

  return (<>
    {err && <div className="err">⚠ {err}</div>}
    {ok && <div className="ok">{ok}</div>}
    <div className="card">
      <h2 style={{ marginTop: 0 }}>➕ Add banner</h2>
      <div className="row">
        <div><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label>Link (optional)</label><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://example.com" /></div>
      </div>
      <input type="file" accept="image/*" onChange={(e) => setF({ ...f, file: e.target.files?.[0] })} />
      <button className="btn" onClick={create} disabled={!f.title || !f.file || busy} style={{ marginTop: 8 }}>
        {busy ? 'Uploading…' : '🖼 Create banner'}
      </button>
    </div>

    {rows.length === 0 && (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem' }}>🖼</div>
        <p className="muted">No banners yet. Create one above — it will appear on the student home page.</p>
      </div>
    )}

    <div className="grid grid-3">
      {rows.map((b) => (
        <div className="card" key={b.id} style={{ opacity: b.isActive === false ? 0.55 : 1 }}>
          <img src={b.imageUrl} alt={b.title} style={{ width: '100%', borderRadius: 8, aspectRatio: '16/9', objectFit: 'cover' }} />

          {editing === b.id ? (
            <div style={{ marginTop: 8 }}>
              <label>Title</label>
              <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              <label>Link</label>
              <input value={editForm.link} onChange={(e) => setEditForm({ ...editForm, link: e.target.value })} placeholder="https://..." />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
                Active (visible to students)
              </label>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-sm" onClick={() => saveEdit(b.id)} disabled={!editForm.title}>💾 Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 4px' }}>
                <b>{b.title}</b>
                {b.isActive === false && <span className="badge gray" style={{ marginLeft: 6 }}>Hidden</span>}
              </p>
              {b.link && <p className="muted" style={{ margin: 0, fontSize: '.78rem', wordBreak: 'break-all' }}>{b.link}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(b)} title="Edit">✎ Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(b)} title={b.isActive ? 'Hide' : 'Show'}>
                  {b.isActive ? '◌ Hide' : '◉ Show'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteBanner(b.id, b.title)} title="Delete"
                  style={{ color: '#e53e3e' }}>🗑 Delete</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </>);
}
