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
  const [f, setF] = useState({ courseId: '', branchId: '', instructorId: '', name: '', startDate: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  const load = () => {
    setBatches(null);
    return api(`/api/batches?${geoQuery(geo, { courseId: fCourse })}`).then((d) => setBatches(d.batches));
  };
  useEffect(() => {
    api('/api/courses').then((d) => setCourses(d.courses));
    api('/api/branches').then((d) => setBranches(d.branches));
    api('/api/team?role=INSTRUCTOR').then((d) => setInstructors(d.team ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [geo.state, geo.city, geo.branchId, fCourse]);

  const create = async () => {
    setErr(''); setOk('');
    try {
      await api('/api/batches', { method: 'POST', json: {
        courseId: f.courseId, branchId: f.branchId, instructorId: f.instructorId || undefined,
        name: f.name, startDate: new Date(f.startDate).toISOString() } });
      setOk('Batch created ✓'); setF({ courseId: '', branchId: '', instructorId: '', name: '', startDate: '' }); load();
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
          <thead><tr><th>Batch</th><th>Course</th><th>Branch</th><th>City / State</th><th>Learners</th><th>Sessions</th><th></th></tr></thead>
          <tbody>{batches.map((b) => (
            <tr key={b.id}>
              <td><b>{b.name}</b></td>
              <td>{b.course.title}</td>
              <td>{b.branch.name}</td>
              <td><span className="badge blue">{b.branch.city}, {b.branch.state}</span></td>
              <td>{b._count.enrollments}</td>
              <td>{b._count.sessions}</td>
              <td><Link href={`/admin/batches/${b.id}`}>Open →</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  </>);
}
