'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';

export default function MyBatches() {
  const [batches, setBatches] = useState<any[]>([]);
  useEffect(() => { api('/api/batches').then((d) => setBatches(d.batches)); }, []);
  return (
    <div className="card"><table>
      <thead><tr><th>Batch</th><th>Course</th><th>Time</th><th>Schedule</th><th>Learners</th><th>Sessions</th><th></th></tr></thead>
      <tbody>{batches.map((b) => <tr key={b.id}>
        <td><b>{b.name}</b></td><td>{b.course.title}</td>
        <td>{b.batchTime || <span className="muted">—</span>}</td>
        <td>{b.schedule ? <span className="badge gray">{b.schedule}</span> : <span className="muted">—</span>}</td>
        <td>{b._count.enrollments}</td><td>{b._count.sessions}</td>
        <td><Link href={`/instructor/batches/${b.id}`}>Open</Link></td>
      </tr>)}</tbody>
    </table></div>
  );
}
