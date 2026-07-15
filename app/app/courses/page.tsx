'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useState as useS } from 'react';

export default function MyCourses() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api('/api/me/courses').then((d) => setRows(d.enrollments)); }, []);
  return (
    <div className="grid grid-4">
      {rows.map((e) => (
        <Link key={e.id} href={`/app/courses/${e.id}`}><div className="card">
          <b>{e.course.title}</b>
          <p className="muted">{e.batch.name}</p>
          <div className="progressbar"><div style={{ width: `${e.progressPct}%` }} /></div>
          <p className="muted">{e.progressPct}% · <span className={`badge ${e.status === 'COMPLETED' ? 'green' : 'gray'}`}>{e.status}</span></p>
          {e.status === 'COMPLETED' && (
            <div onClick={(ev) => ev.preventDefault()} style={{ marginTop: 6 }}>
              <span className="muted">Rate: </span>
              {[1,2,3,4,5].map((r) => (
                <span key={r} style={{ cursor: 'pointer', fontSize: '1.1rem' }}
                  onClick={async () => { await api('/api/reviews', { method: 'POST', json: { courseId: e.course.id, rating: r } }); alert('Thanks for rating ' + r + '★'); }}>⭐</span>
              ))}
            </div>
          )}
        </div></Link>
      ))}
      {rows.length === 0 && <p className="muted">No courses yet — contact your branch office.</p>}
    </div>
  );
}
