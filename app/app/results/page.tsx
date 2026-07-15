'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Results() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api('/api/me/results').then((d) => setRows(d.results)); }, []);
  return (
    <div className="card"><table>
      <thead><tr><th>Assessment</th><th>Type</th><th>Marks</th><th>Feedback</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>
        <td>{r.material.title} {r.isLate && <span className="badge amber">LATE</span>}</td>
        <td><span className="badge gray">{r.material.type}</span></td>
        <td><b>{r.marks}</b></td><td className="muted">{r.feedback ?? '—'}</td>
      </tr>)}</tbody></table>
      {rows.length === 0 && <p className="muted">No published results yet.</p>}
    </div>
  );
}
