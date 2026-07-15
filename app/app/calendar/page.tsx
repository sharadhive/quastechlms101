'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Calendar() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api('/api/me/calendar').then((d) => setRows(d.sessions)); }, []);
  return (
    <div className="card"><h2 style={{ marginTop: 0 }}>Upcoming (30 days)</h2><table>
      <thead><tr><th>Session</th><th>Course</th><th>When</th><th></th></tr></thead>
      <tbody>{rows.map((s) => <tr key={s.id}>
        <td>{s.title}</td><td>{s.batch.course.title}</td><td>{new Date(s.scheduledAt).toLocaleString()}</td>
        <td>{s.meetLink && <a href={s.meetLink} target="_blank">Join</a>}</td>
      </tr>)}</tbody></table>
    </div>
  );
}
