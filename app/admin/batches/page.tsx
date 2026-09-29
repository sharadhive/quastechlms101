'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Empty, SkelRows, GeoFilter, geoQuery } from '@/components/ui';

export default function Batches() {
  const [batches, setBatches] = useState<any[] | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [instructors, setInstructors] = useState<any[]>([]);
  const [geo, setGeo] = useState({ state: '', city: '', branchId: '' });
  const [fCourse, setFCourse] = useState('');
  const empty = { courseId: '', branchId: '', instructorId: '', name: '', startDate: '', endDate: '', capacity: '', batchTime: '', schedule: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  const load = () => {
    setBatches(null);
    return api(`/api/batches?${geoQuery(geo, { courseId: fCourse })}`).then((d) => setBatches(d.batches));
  };
  useEffect(() => {
    api('/api/courses').then((d) => setCourses(d.courses));
    api('/api/branches').then((d) => setBranches(d.branches));
    api('/api/team?role=INSTRUCTOR').then((d) => setInstructors((d.team ?? []).filter((t: any) => t.isActive))).catch(() => {});
    // Opened from a course ("+ Create a batch") → course pre-selected
    const cid = new URLSearchParams(window.location.search).get('courseId');
    if (cid) setF((x) => ({ ...x, courseId: cid }));
  }, []);
  useEffect(() => { load(); }, [geo.state, geo.city, geo.branchId, fCourse]);

  const create = async () => {
    setErr(''); setOk('');
    try {
      await api('/api/batches', { method: 'POST', json: {
        courseId: f.courseId, branchId: f.branchId, instructorId: f.instructorId || undefined,
        name: f.name, startDate: new Date(f.startDate).toISOString(),
        endDate: f.endDate ? new Date(f.endDate).toISOString() : undefined,
        capacity: f.capacity ? Number(f.capacity) : undefined,
        batchTime: f.batchTime || undefined, schedule: f.schedule || undefined } });
      setOk('Batch created ✓ — open it to schedule classes');
      setF(empty);
      load();
    } catch (e: any) { setErr(e.message); }
  };

  return (<>
    <div className="card">
      <h2>➕ Create batch</h2>
      <div className="row">
        <div><label>Course</label>
          <select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
            <option value="">Select…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></div>
        <div><label>Branch (city, state)</label>
          <select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
            <option value="">Select…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.city}, {b.state}</option>)}
          </select></div>
        <div><label>Instructor</label>
          <select value={f.instructorId} onChange={(e) => setF({ ...f, instructorId: e.target.value })}>
            <option value="">Unassigned</option>
            {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
      </div>
      <div className="row">
        <div><label>Batch name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Start date</label><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
        <div><label>End date (optional)</label><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
        <div><label>Seats (optional)</label><input type="number" min={1} placeholder="e.g. 30" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Batch time</label><input placeholder="e.g. 10:00 AM - 12:00 PM" value={f.batchTime} onChange={(e) => setF({ ...f, batchTime: e.target.value })} /></div>
        <div><label>Schedule</label>
          <select value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })}>
            <option value="">Select…</option>
            <option value="WEEKDAY">Weekday</option>
            <option value="WEEKEND">Weekend</option>
            <option value="CUSTOM">Custom</option>
          </select></div>
      </div>
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
      <button className="btn" onClick={create} disabled={!f.courseId || !f.branchId || !f.name || !f.startDate}>Create</button>
    </div>

    <div className="card">
      <div className="filterbar">
        <GeoFilter value={geo} onChange={setGeo} />
        <select value={fCourse} onChange={(e) => setFCourse(e.target.value)}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <span className="chip">{batches?.length ?? 0} batches</span>
      </div>
      {batches === null ? <SkelRows /> : batches.length === 0 ? <Empty icon="🎓" text="No batches match these filters" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Batch</th><th>Course</th><th>Branch</th><th>City / State</th><th>Time</th><th>Schedule</th><th>Learners</th><th>Sessions</th><th></th></tr></thead>
          <tbody>{batches.map((b) => (
            <tr key={b.id}>
              <td><b>{b.name}</b></td>
              <td>{b.course.title}</td>
              <td>{b.branch.name}</td>
              <td><span className="badge blue">{b.branch.city}, {b.branch.state}</span></td>
              <td>{b.batchTime || <span className="muted">—</span>}</td>
              <td>{b.schedule ? <span className="badge gray">{b.schedule}</span> : <span className="muted">—</span>}</td>
              <td>{b._count.enrollments}{b.capacity ? ` / ${b.capacity}` : ''}</td>
              <td>{b._count.sessions}</td>
              <td><Link href={`/admin/batches/${b.id}`}>Open →</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
