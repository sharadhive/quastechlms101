'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';
import RecordingPlayer from '@/components/RecordingPlayer';

export default function StudentRecordings() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [playing, setPlaying] = useState<any>(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/api/me/recordings').then((d) => setRows(d.recordings)).catch(() => setRows([])); }, []);

  const shown = (rows ?? []).filter((r) => !q || `${r.title} ${r.batch.course.title}`.toLowerCase().includes(q.toLowerCase()));
  const groups = new Map<string, any[]>();
  for (const r of shown) {
    const k = `${r.batch.course.title} · ${r.batch.name}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  return (<>
    <div className="page-head">
      <div>
        <h1>🎥 Class Recordings</h1>
        <div className="sub">Missed a live class or want to revise? Watch the recordings of your batches here.</div>
      </div>
      <input style={{ maxWidth: 280 }} placeholder="🔍 Search recordings…" value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
    {playing && <RecordingPlayer id={playing.id} title={playing.title} onClose={() => setPlaying(null)} />}
    {rows === null ? <div className="card"><SkelRows /></div> : shown.length === 0 ? (
      <div className="card"><Empty icon="🎥" text={rows.length === 0 ? 'No class recordings yet. They appear here after your instructor uploads them.' : 'No recordings match your search.'} /></div>
    ) : [...groups.entries()].map(([k, list]) => (
      <div className="card" key={k}>
        <h2>{k}</h2>
        {list.map((r) => (
          <div className="mat-row" key={r.id} style={{ cursor: 'pointer' }} onClick={() => { setPlaying(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <span>▶</span>
            <span className="grow"><b>{r.title}</b></span>
            <span className="muted" style={{ fontSize: '.8rem' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    ))}
  </>);
}
