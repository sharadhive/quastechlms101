'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';

/** Inline player for a class recording (fetches a short-lived signed URL). */
export default function RecordingPlayer({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const [url, setUrl] = useState(''); const [err, setErr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const renewedAt = useRef(0);
  useEffect(() => {
    setUrl(''); setErr('');
    api(`/api/recordings/${id}/stream-url`).then((d) => setUrl(d.url)).catch((e) => setErr(e.message));
  }, [id]);

  /** Signed links expire — if the recording stays open that long, get a fresh link and continue at the same second. */
  const renew = () => {
    if (Date.now() - renewedAt.current < 30_000) return; // failed again right away = real problem, don't loop
    renewedAt.current = Date.now();
    const at = videoRef.current?.currentTime ?? 0;
    api(`/api/recordings/${id}/stream-url`).then((d) => {
      setUrl(d.url);
      setTimeout(() => {
        const v = videoRef.current;
        if (v) { v.currentTime = at; v.play().catch(() => {}); }
      }, 80);
    }).catch((e) => setErr(e.message));
  };
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b>▶ {title}</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      {err && <div className="err">{err}</div>}
      {url && (
        <video ref={videoRef} src={url} controls autoPlay controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} onError={renew}
          style={{ width: '100%', maxHeight: '70vh', borderRadius: 10, background: '#000' }} />
      )}
      {!url && !err && <p className="muted">Loading video…</p>}
    </div>
  );
}
