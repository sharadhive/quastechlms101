'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

/** Inline player for a class recording (fetches a short-lived signed URL). */
export default function RecordingPlayer({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const [url, setUrl] = useState(''); const [err, setErr] = useState('');
  useEffect(() => {
    setUrl(''); setErr('');
    api(`/api/recordings/${id}/stream-url`).then((d) => setUrl(d.url)).catch((e) => setErr(e.message));
  }, [id]);
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b>▶ {title}</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      {err && <div className="err">{err}</div>}
      {url && (
        <video src={url} controls autoPlay controlsList="nodownload" onContextMenu={(e) => e.preventDefault()}
          style={{ width: '100%', maxHeight: '70vh', borderRadius: 10, background: '#000' }} />
      )}
      {!url && !err && <p className="muted">Loading video…</p>}
    </div>
  );
}
