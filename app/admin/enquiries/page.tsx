'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Enquiries() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api('/api/enquiries').then((d) => setRows(d.enquiries)); }, []);
  return (
    <div className="card"><table>
      <thead><tr><th>Name</th><th>Contact</th><th>Interest</th><th>Source</th><th>Received</th></tr></thead>
      <tbody>{rows.map((e) => <tr key={e.id}>
        <td>{e.name}</td><td>{e.email ?? ''} {e.phone ?? ''}</td><td>{e.courseInterest ?? '—'}</td>
        <td><span className="badge gray">{e.source}</span></td><td>{new Date(e.createdAt).toLocaleString()}</td>
      </tr>)}</tbody>
    </table></div>
  );
}
