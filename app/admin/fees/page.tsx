'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Empty, SkelRows, GeoFilter, geoQuery } from '@/components/ui';

export default function Fees() {
  const [d, setD] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [geo, setGeo] = useState({ state: '', city: '', branchId: '' });
  const [batchId, setBatchId] = useState('');

  const load = () => {
    setD(null);
    return api(`/api/fees/pending?${geoQuery(geo, { batchId })}`).then(setD);
  };
  // batches list follows the geo filter too (fully dependent chain)
  const loadBatches = () => api(`/api/batches?${geoQuery(geo)}`).then((x) => setBatches(x.batches));
  useEffect(() => { setBatchId(''); loadBatches(); }, [geo.state, geo.city, geo.branchId]);
  useEffect(() => { load(); }, [geo.state, geo.city, geo.branchId, batchId]);

  return (
    <div className="card">
      <div className="filterbar">
        <GeoFilter value={geo} onChange={setGeo} />
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {d && <span className="chip">{d.count} learners · ₹{Number(d.totalPending).toLocaleString('en-IN')} pending</span>}
      </div>
      {!d ? <SkelRows /> : d.rows.length === 0 ? <Empty icon="✅" text="No pending fees for this filter" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Learner</th><th>Course</th><th>Batch</th><th>Total</th><th>Pending</th><th></th></tr></thead>
          <tbody>{d.rows.map((r: any) => (
            <tr key={r.enrollment.id}>
              <td><b>{r.enrollment.learner.name}</b><br /><span className="muted">{r.enrollment.learner.phone ?? r.enrollment.learner.email}</span></td>
              <td>{r.enrollment.course.title}</td>
              <td>{r.enrollment.batch.name}</td>
              <td>₹{Number(r.totalFee).toLocaleString('en-IN')}</td>
              <td><b style={{ color: 'var(--red)' }}>₹{Number(r.pendingAmount).toLocaleString('en-IN')}</b></td>
              <td><Link href={`/admin/learners/${r.enrollment.learner.id}`} className="btn btn-ghost btn-sm">Record payment</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
