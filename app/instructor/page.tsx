'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Kpi, Donut, Bars, HBars, Radial, HeatMap, Empty, SkelRows } from '@/components/ui';

export default function InstructorDashboard() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/dashboard/instructor').then(setD).catch((e) => setErr(e.message)); }, []);
  const start = async (id: string) => { await api(`/api/sessions/${id}/start`, { method: 'POST' }); api('/api/dashboard/instructor').then(setD); };
  if (err) return <div className="card err">{err}</div>;
  if (!d) return <div className="card"><SkelRows n={5} /></div>;

  return (<>
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <Kpi label="My batches" value={d.myBatches} />
      <Kpi label="My learners" value={d.totalLearners} />
      <Kpi label="Pending evaluations" value={d.pendingEvaluations} />
      <Kpi label="Open questions" value={d.openQuestions} />
      <Kpi label={`Avg rating (${d.ratingCount})`} value={d.avgRating ? `★ ${Number(d.avgRating).toFixed(1)}` : '—'} />
      <Kpi label="Avg quiz marks" value={d.avgMarks || '—'} />
    </div>

    <div className="card">
      <h2>📊 My teaching performance</h2>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'space-around' }}>
        <Radial pct={d.attendanceRate} label="Class attendance" color="#06B6D4" />
        <Radial pct={d.avgProgress} label="Avg learner progress" color="#7C3AED" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>{d.sessionsHeld}</div>
          <div className="muted">Classes (8 weeks)</div>
        </div>
      </div>
    </div>

    <div className="grid grid-2">
      <div className="card">
        <h2>👥 Learners per batch</h2>
        <Bars data={d.learnersByBatch} height={180} />
      </div>
      <div className="card">
        <h2>📝 Submission status</h2>
        <Donut data={d.submissionSplit} />
      </div>
    </div>

    <div className="grid grid-2">
      <div className="card">
        <h2>⭐ My rating breakdown</h2>
        <HBars data={d.ratingDist} />
      </div>
      <div className="card">
        <h2>🔥 Teaching activity — last 8 weeks</h2>
        <HeatMap days={d.activity} />
        <p className="muted" style={{ marginTop: 8 }}>Each square is a day · darker = more classes</p>
        <h2 style={{ marginTop: 14 }}>Learner status</h2>
        <HBars data={d.statusSplit} />
      </div>
    </div>

    <div className="card">
      <h2>Today's sessions</h2>
      {d.todaysSessions.length === 0 ? <Empty icon="🗓️" text="No sessions today" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Session</th><th>Batch</th><th>Time</th><th></th></tr></thead>
          <tbody>{d.todaysSessions.map((s: any) => (
            <tr key={s.id}>
              <td><b>{s.title}</b></td>
              <td>{s.batch.name}</td>
              <td>{new Date(s.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td>
                {s.startedAt ? <span className="badge green">● Started</span>
                  : <button className="btn btn-sm" onClick={() => start(s.id)}>Start session</button>}
                {' '}<Link href={`/instructor/batches/${s.batch.id}`} className="muted">Attendance →</Link>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
