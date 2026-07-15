'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Certificates() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api('/api/me/certificates').then((d) => setRows(d.certificates)); }, []);
  return (
    <div className="grid grid-4">
      {rows.map((c) => (
        <div className="card" key={c.id}>
          <p style={{ fontSize: '2rem', margin: 0 }}>🎓</p>
          <b>{c.courseTitle}</b>
          <p className="muted">Issued {new Date(c.issuedAt).toDateString()}<br />Verify code: {c.verifyCode}</p>
          {c.downloadUrl ? <a className="btn btn-sm" href={c.downloadUrl} target="_blank">Download PDF</a>
            : <span className="badge amber">Rendering…</span>}
        </div>
      ))}
      {rows.length === 0 && <p className="muted">Complete a course to earn your first certificate.</p>}
    </div>
  );
}
