'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Analytics() {
  const [collections, setCollections] = useState<any>(null);
  const [trend, setTrend] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState(''); const [attendance, setAttendance] = useState<any>(null);
  useEffect(() => {
    api('/api/analytics/collections').then(setCollections);
    api('/api/analytics/enrollments').then(setTrend);
    api('/api/batches').then((d) => setBatches(d.batches));
  }, []);
  useEffect(() => { if (batchId) api(`/api/reports/attendance?batchId=${batchId}`).then(setAttendance); }, [batchId]);
  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Fee collections (last 30 days) — <a href="/api/analytics/collections?format=csv">Export CSV</a></h2>
      {collections && (<><p>Total: <b>₹{collections.total}</b> across {collections.count} payments</p>
        <p className="muted">{Object.entries(collections.byMode).map(([m, v]) => `${m}: ₹${v}`).join(' · ')}</p></>)}
    </div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Enrollment trend (by branch, monthly)</h2>
      {trend && <table><thead><tr><th>Month</th><th>Enrollments per branch</th></tr></thead><tbody>
        {Object.entries(trend.trend).map(([ym, byBranch]: any) => <tr key={ym}><td>{ym}</td><td>{Object.values(byBranch as Record<string, number>).reduce((a, b) => a + b, 0)} total</td></tr>)}
      </tbody></table>}
    </div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Attendance report</h2>
      <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
        <option value="">Select batch…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.course.title}</option>)}
      </select>
      {attendance && <table><thead><tr><th>Learner</th><th>Present</th><th>%</th><th></th></tr></thead><tbody>
        {attendance.report.map((r: any) => <tr key={r.id}><td>{r.name}</td><td>{r.present}/{r.totalSessions}</td><td>{r.pct ?? '—'}%</td>
          <td>{r.low && <span className="badge red">LOW</span>}</td></tr>)}
      </tbody></table>}
    </div>
  </>);
}
