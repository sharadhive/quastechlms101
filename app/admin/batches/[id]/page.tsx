'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Empty } from '@/components/ui';

const toDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const toLocalDT = (d: string) => {
  const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<any>(null);
  const [instructors, setInstructors] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState({ title: '', scheduledAt: '', meetLink: '' });
  const [resched, setResched] = useState<Record<string, string>>({});
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  const load = () => api(`/api/batches/${id}`).then((d) => setB(d.batch)).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    api('/api/team?role=INSTRUCTOR').then((d) => setInstructors((d.team ?? []).filter((t: any) => t.isActive))).catch(() => {});
  }, [id]);

  const act = async (fn: () => Promise<any>, msg: string) => {
    setErr(''); setOk('');
    try { await fn(); setOk(msg); await load(); } catch (e: any) { setErr(e.message); }
  };
  const createSession = () => act(async () => {
    await api(`/api/batches/${id}/sessions`, { method: 'POST', json: { title: f.title, scheduledAt: new Date(f.scheduledAt).toISOString(), meetLink: f.meetLink || undefined } });
    setF({ title: '', scheduledAt: '', meetLink: '' });
  }, 'Class scheduled ✓ — students get reminders 24h and 1h before');
  const saveEdit = () => act(async () => {
    await api(`/api/batches/${id}`, { method: 'PATCH', json: {
      name: edit.name,
      instructorId: edit.instructorId || null,
      startDate: new Date(edit.startDate).toISOString(),
      endDate: edit.endDate ? new Date(edit.endDate).toISOString() : null,
      capacity: edit.capacity ? Number(edit.capacity) : null,
      batchTime: edit.batchTime || null,
      schedule: edit.schedule || null,
    } });
    setEdit(null);
  }, 'Batch updated ✓');
  const removeBatch = async () => {
    if (!confirm(`Delete batch “${b.name}”? This is only possible when it has no learners.`)) return;
    try { await api(`/api/batches/${id}`, { method: 'DELETE' }); router.push('/admin/batches'); }
    catch (e: any) { setErr(e.message); }
  };

  if (err && !b) return <div className="card err">{err}</div>;
  if (!b) return <p className="muted">Loading…</p>;
  const now = Date.now();
  const upcoming = b.sessions.filter((s: any) => new Date(s.scheduledAt).getTime() >= now - 3 * 3600_000);
  const past = b.sessions.filter((s: any) => new Date(s.scheduledAt).getTime() < now - 3 * 3600_000).reverse();

  return (<>
    <div className="card">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}><Link href="/admin/batches">← Batches</Link></div>
          <h1 style={{ marginTop: 4 }}>{b.name}</h1>
          <div className="sub">
            <Link href={`/admin/courses/${b.course.id}`}>{b.course.title}</Link> ·
            {' '}Instructor: <b>{b.instructor?.name ?? 'not assigned'}</b> ·
            {' '}{b.enrollments.length}{b.capacity ? ` / ${b.capacity}` : ''} learners ·
            {' '}starts {new Date(b.startDate).toLocaleDateString()}{b.endDate ? ` · ends ${new Date(b.endDate).toLocaleDateString()}` : ''}
            {b.batchTime ? ` · ${b.batchTime}` : ''}{b.schedule ? ` · ${b.schedule}` : ''}
          </div>
        </div>
        <div className="actions">
          <Link className="btn" href="/admin/enroll">＋ Enrol learner</Link>
          <button className="btn btn-ghost" onClick={() => setEdit({
            name: b.name, instructorId: b.instructorId ?? '', startDate: toDate(b.startDate), endDate: toDate(b.endDate),
            capacity: b.capacity ?? '', batchTime: b.batchTime ?? '', schedule: b.schedule ?? '',
          })}>✎ Edit batch</button>
          {b.enrollments.length === 0 && <button className="btn btn-danger" onClick={removeBatch}>Delete</button>}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: '.8rem' }}>Syllabus covered: {b.coveredSections} of {b.totalSections} topics</div>
        <div className="progressbar" style={{ marginTop: 4 }}><div style={{ width: `${b.syllabusProgress}%` }} /></div>
      </div>
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    </div>

    {edit && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <h2>Edit batch</h2>
        <div className="row">
          <div><label>Batch name</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><label>Instructor</label>
            <select value={edit.instructorId} onChange={(e) => setEdit({ ...edit, instructorId: e.target.value })}>
              <option value="">Not assigned</option>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select></div>
          <div><label>Seats</label><input type="number" min={1} value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} /></div>
        </div>
        <div className="row">
          <div><label>Start date</label><input type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></div>
          <div><label>End date</label><input type="date" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} /></div>
          <div><label>Batch time</label><input placeholder="10:00 AM - 12:00 PM" value={edit.batchTime} onChange={(e) => setEdit({ ...edit, batchTime: e.target.value })} /></div>
          <div><label>Schedule</label>
            <select value={edit.schedule} onChange={(e) => setEdit({ ...edit, schedule: e.target.value })}>
              <option value="">—</option><option value="WEEKDAY">Weekday</option><option value="WEEKEND">Weekend</option><option value="CUSTOM">Custom</option>
            </select></div>
        </div>
        <div className="actions">
          <button className="btn" onClick={saveEdit} disabled={!edit.name || !edit.startDate}>Save</button>
          <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </div>
    )}

    <div className="card">
      <h2>📅 Schedule a class</h2>
      <div className="row">
        <div><label>Title</label><input placeholder="e.g. React — useState & useEffect" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label>Date &amp; time</label><input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></div>
        <div><label>Zoom / Meet link</label><input placeholder="https://…" value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} /></div>
      </div>
      <button className="btn" onClick={createSession} disabled={!f.title || !f.scheduledAt}>Schedule class</button>
    </div>

    <div className="card">
      <h2>Upcoming classes</h2>
      {upcoming.length === 0 ? <Empty icon="🗓️" text="No upcoming classes" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Class</th><th>When</th><th>Link</th><th></th></tr></thead>
          <tbody>{upcoming.map((s: any) => (
            <tr key={s.id}>
              <td><b>{s.title}</b></td>
              <td>{new Date(s.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td>{s.meetLink ? <a href={s.meetLink} target="_blank">Join ↗</a> : <span className="muted">—</span>}</td>
              <td><div className="actions" style={{ gap: 6 }}>
                <input type="datetime-local" style={{ margin: 0, maxWidth: 200 }} value={resched[s.id] ?? toLocalDT(s.scheduledAt)}
                  onChange={(e) => setResched({ ...resched, [s.id]: e.target.value })} />
                <button className="btn btn-ghost btn-sm" disabled={!resched[s.id]}
                  onClick={() => act(() => api(`/api/sessions/${s.id}`, { method: 'PATCH', json: { scheduledAt: new Date(resched[s.id]).toISOString() } }), 'Class rescheduled ✓ — reminders updated')}>Reschedule</button>
                <button className="btn btn-danger btn-sm"
                  onClick={() => confirm(`Cancel “${s.title}”?`) && act(() => api(`/api/sessions/${s.id}`, { method: 'DELETE' }), 'Class cancelled')}>Cancel</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>

    {past.length > 0 && (
      <div className="card">
        <h2>Past classes</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Class</th><th>When</th><th>Attendance marked</th></tr></thead>
          <tbody>{past.map((s: any) => (
            <tr key={s.id}><td>{s.title}</td><td>{new Date(s.scheduledAt).toLocaleString()}</td>
              <td>{s.attendanceCount > 0 ? <span className="badge green">{s.attendanceCount} marked</span> : <span className="badge gray">not marked</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    )}

    <div className="card">
      <h2>👥 Learners ({b.enrollments.length})</h2>
      {b.enrollments.length === 0 ? <Empty icon="🧑‍🎓" text="No learners in this batch yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Progress</th><th>Status</th><th></th></tr></thead>
          <tbody>{b.enrollments.map((e: any) => (
            <tr key={e.id}>
              <td><b>{e.learner.name}</b></td>
              <td>{e.learner.email}<br /><span className="muted">{e.learner.phone ?? ''}</span></td>
              <td style={{ minWidth: 120 }}><div className="progressbar"><div style={{ width: `${e.progressPct}%` }} /></div>
                <span className="muted" style={{ fontSize: '.78rem' }}>{Number(e.progressPct)}%</span></td>
              <td><span className={`badge ${e.status === 'COMPLETED' ? 'blue' : 'green'}`}>{e.status}</span></td>
              <td><Link href={`/admin/learners/${e.learner.id}`}>Profile / move / drop →</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
