'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';

export default function MyBatches() {
  const [batches, setBatches] = useState<any[]>([]);
  useEffect(() => { api('/api/batches').then((d) => setBatches(d.batches)); }, []);
  return (
    <div className="card"><table>
      <thead><tr><th>Batch</th><th>Course</th><th>Learners</th><th>Sessions</th><th></th></tr></thead>
      <tbody>{batches.map((b) => <tr key={b.id}>
        <td>{b.name}</td><td>{b.course.title}</td><td>{b._count.enrollments}</td><td>{b._count.sessions}</td>
        <td><Link href={`/instructor/batches/${b.id}`}>Open</Link></td>
      </tr>)}</tbody>
    </table></div>
  );
}
