'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Kpi, AreaChart, Donut, Bars, HBars, Radial, Funnel, Empty, SkelRows, GeoFilter, geoQuery } from '@/components/ui';

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

export default function AdminDashboard() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [geo, setGeo] = useState({ state: '', city: '', branchId: '' });
  useEffect(() => {
    setD(null);
    api(`/api/dashboard/admin?${geoQuery(geo)}`).then(setD).catch((e) => setErr(e.message));
  }, [geo.state, geo.city, geo.branchId]);
  if (err) return <div className="card err">{err}</div>;
  if (!d) return <div className="card"><SkelRows n={6} /></div>;

  const trend = d.dailyEnrollments.map((x: any) => x.count);
  const labels = d.dailyEnrollments.map((x: any) => x.date);

  const scopeLabel = geo.branchId ? 'this branch' : geo.city ? geo.city : geo.state ? geo.state : 'all branches';

  // First-time guidance: show an ordered checklist until the institute is set up
  const steps = [
    { done: (d.enrollmentsByBranch?.length ?? 0) > 0 || d.totalLearners > 0, label: 'Create your branches (state, city)', href: '/admin/branches' },
    { done: d.publishedCourses > 0, label: 'Build and publish a course', href: '/admin/courses' },
    { done: d.activeBatches > 0, label: 'Create a batch and assign an instructor', href: '/admin/batches' },
    { done: d.totalLearners > 0, label: 'Add learners and enroll them', href: '/admin/enroll' },
  ];
  const pendingSteps = steps.filter((s) => !s.done);

  return (<>
    {pendingSteps.length > 0 && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <h2>👋 Getting started — {steps.length - pendingSteps.length}/{steps.length} done</h2>
        <p className="muted" style={{ marginTop: 0 }}>Follow these in order. Each step unlocks the next.</p>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className={`badge ${s.done ? 'green' : 'gray'}`}>{s.done ? '✓' : i + 1}</span>
            <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--muted)' : 'var(--text)' }}>{s.label}</span>
            {!s.done && <Link href={s.href} className="btn btn-sm">Go →</Link>}
          </div>
        ))}
      </div>
    )}
    <div className="card" style={{ padding: '12px 16px' }}>
      <div className="filterbar" style={{ marginBottom: 0 }}>
        <b style={{ fontSize: '.85rem' }}>📍 Analytics for:</b>
        <GeoFilter value={geo} onChange={setGeo} />
        <span className="chip">Showing {scopeLabel}</span>
      </div>
    </div>

    {/* KPI strip */}
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <Kpi label="Enrollments this month" value={d.enrollmentsThisMonth} delta={d.enrollmentsDelta} spark={trend.slice(-10)} />
      <Kpi label="Collections (30 days)" value={inr(d.collections30)} />
      <Kpi label="Pending fees" value={inr(d.pendingFeesTotal)} />
      <Kpi label="Total learners" value={d.totalLearners} />
      <Kpi label="Active batches" value={d.activeBatches} />
      <Kpi label="Published courses" value={d.publishedCourses} />
      <Kpi label="Pending evaluations" value={d.pendingEvaluations} />
      <Kpi label={`Avg trainer rating (${d.ratingCount})`} value={d.avgRating ? `★ ${Number(d.avgRating).toFixed(1)}` : '—'} />
    </div>

    {/* Health rings */}
    <div className="card">
      <h2>📈 Institute health</h2>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'space-around' }}>
        <Radial pct={d.collectionRate} label="Fees collected" color="#10B981" />
        <Radial pct={d.attendanceRate} label="Attendance rate" color="#06B6D4" />
        <Radial pct={d.completionRate} label="Course completion" color="#7C3AED" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>{d.sessionsHeld30}</div>
          <div className="muted">Classes held (30d)</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800 }}>{d.totalEnquiries}</div>
          <div className="muted">Enquiries received</div>
        </div>
      </div>
    </div>

    {/* Enrollment trend */}
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>Enrollments — last 30 days</h2>
        <span className="chip">{trend.reduce((a: number, b: number) => a + b, 0)} total</span>
      </div>
      <AreaChart data={trend} labels={labels} />
    </div>

    {/* Revenue + fee split */}
    <div className="grid grid-2">
      <div className="card">
        <h2>💰 Revenue — last 6 months</h2>
        <Bars data={d.revenueByMonth} money />
      </div>
      <div className="card">
        <h2>Fee status</h2>
        <Donut data={d.feeSplit} center={`${d.collectionRate}%`} />
        <h2 style={{ marginTop: 18 }}>Payment modes</h2>
        <HBars data={d.paymentModes} money />
      </div>
    </div>

    {/* Distributions */}
    <div className="grid grid-2">
      <div className="card">
        <h2>📚 Enrollments by course</h2>
        <Donut data={d.enrollmentsByCourse} />
      </div>
      <div className="card">
        <h2>🏢 Enrollments by branch</h2>
        <Bars data={d.enrollmentsByBranch} height={170} />
        <h2 style={{ marginTop: 14 }}>Learner status</h2>
        <HBars data={d.statusSplit} />
      </div>
    </div>

    {/* Funnel */}
    <div className="card">
      <h2>🔻 Admission funnel</h2>
      <Funnel stages={d.funnel} />
    </div>

    {/* Today's sessions */}
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>Today's sessions ({d.todaysSessions.length})</h2>
        <Link href="/admin/batches" className="muted">Manage batches →</Link>
      </div>
      {d.todaysSessions.length === 0 ? <Empty icon="🗓️" text="No sessions scheduled today" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Session</th><th>Batch / Course</th><th>Time</th><th>Learners</th><th>Status</th></tr></thead>
          <tbody>{d.todaysSessions.map((s: any) => (
            <tr key={s.id}>
              <td><b>{s.title}</b></td>
              <td>{s.batch.name}<br /><span className="muted">{s.batch.course.title}</span></td>
              <td>{new Date(s.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{s.batch._count.enrollments}</td>
              <td>{s.startedAt ? <span className="badge green">● LIVE / HELD</span>
                : s.meetLink ? <a className="badge blue" href={s.meetLink} target="_blank">Join link ↗</a>
                : <span className="badge gray">Scheduled</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
