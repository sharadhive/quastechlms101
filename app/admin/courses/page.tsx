'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';
import CourseCards from '@/components/CourseCards';

const STATUSES = [['', 'All'], ['DRAFT', '📝 Draft'], ['PUBLISHED', '✅ Published'], ['ARCHIVED', '🗄 Archived']];

export default function Courses() {
  const router = useRouter();
  const [courses, setCourses] = useState<any[] | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ title: '', categoryId: '', isFree: false, price: '' });
  const [newCat, setNewCat] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const load = () => api('/api/courses').then((d) => setCourses(d.courses));
  const loadCats = () => api('/api/categories').then((d) => setCategories(d.categories)).catch(() => {});
  useEffect(() => { load(); loadCats(); }, []);

  const addCat = async () => {
    try { const d = await api('/api/categories', { method: 'POST', json: { name: newCat.trim() } }); setNewCat(''); await loadCats(); setF({ ...f, categoryId: d.category.id }); }
    catch (e: any) { setErr(e.message); }
  };
  // Create → go straight into the builder to add modules and lessons
  const create = async () => {
    setErr(''); setBusy(true);
    try {
      const d = await api('/api/courses', { method: 'POST', json: {
        title: f.title.trim(), categoryId: f.categoryId || undefined,
        isFree: f.isFree, price: f.isFree ? 0 : Number(f.price || 0),
      } });
      router.push(`/admin/courses/${d.course.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  const shown = (courses ?? []).filter((c) =>
    (!status || c.status === status) && (!q || c.title.toLowerCase().includes(q.toLowerCase())));

  return (<>
    <div className="page-head">
      <div>
        <h1>📚 Courses</h1>
        <div className="sub">Create a course, then add modules → topics → lessons (videos, PDFs, quizzes, assignments) in the builder.</div>
      </div>
      <button className="btn" onClick={() => setShowNew(!showNew)}>{showNew ? 'Close' : '＋ New course'}</button>
    </div>

    {showNew && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <h2>Step 1 · Name your course</h2>
        <div className="row">
          <div style={{ flex: 2 }}><label>Course title</label>
            <input autoFocus placeholder="e.g. Full Stack Web Development (MERN)" value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && f.title.trim().length > 1 && create()} /></div>
          <div><label>Category</label>
            <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <label>Pricing (for online purchase)</label>
            <div className="filter-chips" style={{ margin: '4px 0 12px' }}>
              <button type="button" className={`filter-chip${f.isFree ? ' active' : ''}`} onClick={() => setF({ ...f, isFree: true })}>🆓 Free</button>
              <button type="button" className={`filter-chip${!f.isFree ? ' active' : ''}`} onClick={() => setF({ ...f, isFree: false })}>💎 Paid</button>
            </div>
          </div>
          {!f.isFree && <div><label>Price (₹)</label><input type="number" min={0} placeholder="e.g. 4999" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>}
          <div>
            <label>New category (optional)</label>
            <div className="row" style={{ gap: 6 }}>
              <input placeholder="e.g. Data Science" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }} disabled={newCat.trim().length < 2} onClick={addCat}>Add</button>
            </div>
          </div>
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn" onClick={create} disabled={busy || f.title.trim().length < 2}>{busy ? 'Creating…' : 'Create & open builder →'}</button>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
          Next: Step 2 add the curriculum · Step 3 publish · Step 4 create a batch and enrol students.
        </p>
      </div>
    )}

    <div className="card">
      <div className="filterbar">
        <input className="grow" placeholder="🔍 Search courses…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filter-chips">
          {STATUSES.map(([v, l]) => (
            <button key={v} className={`filter-chip${status === v ? ' active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <span className="chip">{shown.length} courses</span>
      </div>
      {courses === null ? <SkelRows /> : shown.length === 0
        ? <Empty icon="📚" text={courses.length === 0 ? 'No courses yet — click “＋ New course” to create the first one.' : 'No courses match.'} />
        : <CourseCards courses={shown} base="/admin/courses" />}
    </div>
  </>);
}
