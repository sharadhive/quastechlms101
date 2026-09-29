'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, uploadFile, ACCEPT } from '@/lib/client/api';
import { formatBytes } from '@/lib/utils/files';
import AddLesson from './AddLesson';

const TYPE_ICON: Record<string, string> = { VIDEO: '🎬', PDF: '📄', QUIZ: '❓', ASSIGNMENT: '📝', LINK: '🔗', LIVE: '📡' };
const fmtDur = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

type Tab = 'details' | 'curriculum' | 'publish';

/**
 * One course builder for every panel.
 *  - Super Admin / Admin / Branch Admin: details, curriculum, publishing.
 *  - Instructor: curriculum of the courses they teach (editing needs "Manage course content").
 */
export default function CourseBuilder({ courseId, panel }: { courseId: string; panel: 'admin' | 'instructor' }) {
  const router = useRouter();
  const [course, setCourse] = useState<any>(null);
  const [access, setAccess] = useState({ canEditContent: false, canEditDetails: false });
  const [library, setLibrary] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('curriculum');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<string | null>(null); // sectionId with the add-lesson form open
  const [newModule, setNewModule] = useState('');
  const [linkId, setLinkId] = useState('');
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});
  const [quality, setQuality] = useState<Record<string, { label?: string; file?: File; pct?: number }>>({});
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const load = async () => {
    try {
      const d = await api(`/api/courses/${courseId}`);
      setCourse(d.course); setAccess(d.access);
    } catch (e: any) { setLoadErr(e.message); }
  };
  useEffect(() => {
    load();
    api('/api/modules').then((d) => setLibrary(d.modules)).catch(() => {});
  }, [courseId]);

  const flash = (m: string) => { setOk(m); setErr(''); setTimeout(() => setOk(''), 4000); };
  const run = async (fn: () => Promise<any>, msg?: string) => {
    setErr('');
    try { await fn(); if (msg) flash(msg); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  const stats = useMemo(() => {
    if (!course) return { modules: 0, topics: 0, lessons: 0, hidden: 0, videos: 0 };
    let topics = 0, lessons = 0, hidden = 0, videos = 0;
    for (const cm of course.courseModules) for (const s of cm.module.sections) {
      topics++;
      for (const m of s.materials) { lessons++; if (m.status === 'hidden') hidden++; if (m.type === 'VIDEO') videos++; }
    }
    return { modules: course.courseModules.length, topics, lessons, hidden, videos };
  }, [course]);

  if (loadErr) return <div className="card err">{loadErr}</div>;
  if (!course) return <div className="card"><p className="muted">Loading course…</p></div>;

  const editable = access.canEditContent;
  const isAdmin = panel === 'admin';

  // ── ordering: rewrite positions 0..n-1 so duplicates never block a move ──
  const reorder = async (items: any[], i: number, dir: -1 | 1, save: (item: any, pos: number) => Promise<any>) => {
    const j = i + dir; if (j < 0 || j >= items.length) return;
    const list = [...items]; [list[i], list[j]] = [list[j], list[i]];
    await run(async () => { for (let k = 0; k < list.length; k++) await save(list[k], k); });
  };

  const addModule = () => run(async () => {
    await api(`/api/courses/${courseId}/modules`, { method: 'POST', json: { title: newModule.trim() } });
    setNewModule('');
  }, 'Module added ✓');
  const linkModule = () => run(async () => {
    await api(`/api/courses/${courseId}/modules`, { method: 'POST', json: { moduleId: linkId } });
    setLinkId('');
  }, 'Module linked ✓');
  const addTopic = (moduleId: string) => run(async () => {
    await api(`/api/modules/${moduleId}/sections`, { method: 'POST', json: { title: newTopic[moduleId].trim() } });
    setNewTopic({ ...newTopic, [moduleId]: '' });
  }, 'Topic added ✓');
  const rename = (url: string, current: string, what: string) => {
    const t = prompt(`Rename ${what}`, current);
    if (t && t.trim() && t !== current) run(() => api(url, { method: 'PATCH', json: { title: t.trim() } }), `${what} renamed ✓`);
  };
  const preview = async (m: any) => {
    if (m.type === 'LINK' || m.type === 'LIVE') { window.open(m.quizSchema?.url, '_blank'); return; }
    const w = window.open('', '_blank');
    try { const d = await api(`/api/materials/${m.id}/stream-url`); if (w) w.location.href = d.url; }
    catch (e: any) { w?.close(); setErr(e.message); }
  };
  const addQuality = async (m: any) => {
    const q = quality[m.id] ?? {};
    if (!q.label || !q.file) { setErr('Pick a quality and a video file'); return; }
    setErr('');
    try {
      const fileKey = await uploadFile(q.file, 'material', (pct) => setQuality((s) => ({ ...s, [m.id]: { ...s[m.id], pct } })));
      await api(`/api/materials/${m.id}/variants`, { method: 'POST', json: {
        label: q.label, heightPx: Number(q.label.replace(/\D/g, '')) || 480, fileKey, sizeBytes: q.file.size } });
      setQuality((s) => ({ ...s, [m.id]: {} }));
      flash('Quality version added ✓'); load();
    } catch (e: any) { setErr(e.message); setQuality((s) => ({ ...s, [m.id]: { ...s[m.id], pct: undefined } })); }
  };

  const header = (
    <div className="card">
      <div className="page-head" style={{ marginBottom: 6 }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            <Link href={`/${panel}/courses`}>← All courses</Link>
          </div>
          <h1 style={{ marginTop: 4 }}>
            {course.title}{' '}
            <span className={`badge ${course.status === 'PUBLISHED' ? 'green' : course.status === 'ARCHIVED' ? 'gray' : 'amber'}`}>{course.status}</span>{' '}
            <span className={`badge ${course.visibility === 'PUBLIC' ? 'blue' : 'gray'}`}>{course.visibility === 'PUBLIC' ? '🌐 Public' : '🔒 Private'}</span>
          </h1>
          <div className="sub">
            {stats.modules} modules · {stats.topics} topics · {stats.lessons} lessons{stats.hidden ? ` (${stats.hidden} hidden)` : ''} ·
            {' '}{course._count?.enrollments ?? 0} students · {course.batches.length} batches
          </div>
        </div>
        {isAdmin && course.status !== 'PUBLISHED' && (
          <button className="btn" disabled={stats.lessons === 0}
            title={stats.lessons === 0 ? 'Add at least one lesson first' : ''}
            onClick={() => run(() => api(`/api/courses/${courseId}`, { method: 'PATCH', json: { status: 'PUBLISHED' } }), 'Course published 🎉')}>
            🚀 Publish course
          </button>
        )}
      </div>
      <div className="tabs">
        {isAdmin && <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>① Course details</button>}
        <button className={tab === 'curriculum' ? 'active' : ''} onClick={() => setTab('curriculum')}>{isAdmin ? '② ' : ''}Curriculum &amp; lessons</button>
        {isAdmin && <button className={tab === 'publish' ? 'active' : ''} onClick={() => setTab('publish')}>③ Publish &amp; settings</button>}
      </div>
      {err && <div className="err">⚠ {err}</div>}{ok && <div className="ok">{ok}</div>}
    </div>
  );

  return (<>
    {header}
    {tab === 'details' && isAdmin && <DetailsTab course={course} onSaved={() => { flash('Details saved ✓'); load(); }} onError={setErr} />}
    {tab === 'publish' && isAdmin && (
      <PublishTab course={course} stats={stats} run={run}
        onDeleted={() => router.push('/admin/courses')} goto={setTab} />
    )}

    {tab === 'curriculum' && (<>
      <div className="hint">
        <b>How a course is organised:</b> <b>Module</b> (a big unit, e.g. “Frontend”) → <b>Topic</b> (a chapter, e.g. “HTML Basics”)
        → <b>Lessons</b> (videos, PDF notes, quizzes, assignments, links). Students see them in this exact order.
      </div>
      {!editable && (
        <div className="hint warn">
          You can view this curriculum. To add or change lessons, ask an admin to give you the
          <b> “Manage course content”</b> permission (Admin → Team → 🔑 Manage).
        </div>
      )}

      {course.courseModules.length === 0 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>📦</div>
          <p className="muted">No modules yet. Start by adding the first module below.</p>
        </div>
      )}

      {course.courseModules.map((cm: any, mi: number) => {
        const isOpen = open[cm.moduleId] ?? true;
        const shared = (cm.module._count?.courseModules ?? 1) > 1;
        return (
          <div className="builder-mod" key={cm.moduleId}>
            <div className="builder-head">
              <span onClick={() => setOpen({ ...open, [cm.moduleId]: !isOpen })} style={{ flex: 1 }}>
                {isOpen ? '▾' : '▸'} <span className="seq">Module {mi + 1}</span> · 📦 {cm.module.title}
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}· {cm.module.sections.length} topics{shared ? ' · shared with other courses' : ''}
                </span>
              </span>
              {editable && (<>
                <button className="iconbtn" disabled={mi === 0} title="Move up"
                  onClick={() => reorder(course.courseModules, mi, -1, (x, pos) => api(`/api/modules/${x.moduleId}`, { method: 'PATCH', json: { courseId, position: pos } }))}>↑</button>
                <button className="iconbtn" disabled={mi === course.courseModules.length - 1} title="Move down"
                  onClick={() => reorder(course.courseModules, mi, 1, (x, pos) => api(`/api/modules/${x.moduleId}`, { method: 'PATCH', json: { courseId, position: pos } }))}>↓</button>
                <button className="iconbtn" title="Rename" onClick={() => rename(`/api/modules/${cm.moduleId}`, cm.module.title, 'Module')}>✎</button>
                <button className="iconbtn" title="Remove from this course"
                  onClick={() => confirm(`Remove “${cm.module.title}” from this course?\n(It stays in the module library and can be linked again.)`)
                    && run(() => api(`/api/modules/${cm.moduleId}?courseId=${courseId}`, { method: 'DELETE' }), 'Module removed')}>✕</button>
              </>)}
            </div>

            {isOpen && (
              <div className="builder-body">
                {shared && editable && <div className="hint warn" style={{ marginTop: 0 }}>This module is reused in other courses — changes here appear there too.</div>}
                {cm.module.sections.length === 0 && <p className="muted">No topics yet — add the first topic below.</p>}
                {cm.module.sections.map((s: any, si: number) => (
                  <div className="builder-sec" key={s.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <b style={{ flex: 1 }}><span className="seq">{mi + 1}.{si + 1}</span> {s.title}
                        <span className="muted" style={{ fontWeight: 400 }}> · {s.materials.length} lessons</span></b>
                      {editable && (<>
                        <button className="iconbtn" disabled={si === 0} title="Move up"
                          onClick={() => reorder(cm.module.sections, si, -1, (x, pos) => api(`/api/sections/${x.id}`, { method: 'PATCH', json: { position: pos } }))}>↑</button>
                        <button className="iconbtn" disabled={si === cm.module.sections.length - 1} title="Move down"
                          onClick={() => reorder(cm.module.sections, si, 1, (x, pos) => api(`/api/sections/${x.id}`, { method: 'PATCH', json: { position: pos } }))}>↓</button>
                        <button className="iconbtn" title="Rename" onClick={() => rename(`/api/sections/${s.id}`, s.title, 'Topic')}>✎</button>
                        <button className="iconbtn" title="Delete topic"
                          onClick={() => confirm(`Delete topic “${s.title}” and its ${s.materials.length} lessons?`)
                            && run(() => api(`/api/sections/${s.id}`, { method: 'DELETE' }), 'Topic deleted')}>✕</button>
                      </>)}
                    </div>

                    {s.materials.map((m: any, xi: number) => (
                      <div key={m.id}>
                        <div className="mat-row" style={m.status === 'hidden' ? { opacity: .6 } : undefined}>
                          <span className="seq">{mi + 1}.{si + 1}.{xi + 1}</span>
                          <span>{TYPE_ICON[m.type] ?? '📎'}</span>
                          <span className="grow">
                            {m.title}
                            <span className="muted" style={{ fontSize: '.76rem' }}>
                              {m.durationSec ? ` · ${fmtDur(m.durationSec)}` : ''}
                              {m.sizeBytes ? ` · ${formatBytes(Number(m.sizeBytes))}` : ''}
                              {m.type === 'QUIZ' ? ` · ${m.quizSchema?.questions?.length ?? 0} questions` : ''}
                              {m.type === 'ASSIGNMENT' && m.quizSchema?.dueAt ? ` · due ${new Date(m.quizSchema.dueAt).toLocaleDateString()}` : ''}
                              {m._count?.submissions ? ` · ${m._count.submissions} submissions` : ''}
                            </span>
                          </span>
                          {m.type === 'VIDEO' && m.variants?.length > 0 && <span className="badge blue">{m.variants.length + 1} qualities</span>}
                          <span className={`badge ${m.status === 'published' ? 'green' : m.status === 'hidden' ? 'gray' : 'amber'}`}>
                            {m.status === 'published' ? 'Live' : m.status === 'hidden' ? 'Hidden' : m.status}
                          </span>
                          <button className="iconbtn" title="Preview" onClick={() => preview(m)} disabled={m.type === 'QUIZ' || m.type === 'ASSIGNMENT'}>👁</button>
                          {editable && (<>
                            <button className="iconbtn" disabled={xi === 0} title="Move up"
                              onClick={() => reorder(s.materials, xi, -1, (x, pos) => api(`/api/materials/${x.id}`, { method: 'PATCH', json: { position: pos } }))}>↑</button>
                            <button className="iconbtn" disabled={xi === s.materials.length - 1} title="Move down"
                              onClick={() => reorder(s.materials, xi, 1, (x, pos) => api(`/api/materials/${x.id}`, { method: 'PATCH', json: { position: pos } }))}>↓</button>
                            <button className="iconbtn" title="Rename" onClick={() => rename(`/api/materials/${m.id}`, m.title, 'Lesson')}>✎</button>
                            <button className="iconbtn" title={m.status === 'hidden' ? 'Show to students' : 'Hide from students'}
                              onClick={() => run(() => api(`/api/materials/${m.id}`, { method: 'PATCH', json: { status: m.status === 'hidden' ? 'published' : 'hidden' } }),
                                m.status === 'hidden' ? 'Lesson is visible again' : 'Lesson hidden from students')}>{m.status === 'hidden' ? '◉' : '◌'}</button>
                            <button className="iconbtn" title="Delete lesson"
                              onClick={() => confirm(`Delete “${m.title}”? This also deletes the uploaded file.`)
                                && run(() => api(`/api/materials/${m.id}`, { method: 'DELETE' }), 'Lesson deleted')}>✕</button>
                          </>)}
                        </div>
                        {editable && m.type === 'VIDEO' && (
                          <div className="row" style={{ margin: '0 0 8px 44px', maxWidth: 620, alignItems: 'center' }}>
                            <select value={quality[m.id]?.label ?? ''} style={{ maxWidth: 190, margin: 0 }}
                              onChange={(e) => setQuality({ ...quality, [m.id]: { ...quality[m.id], label: e.target.value } })}>
                              <option value="">+ Add another quality…</option>
                              <option value="1080p">1080p (HD)</option>
                              <option value="720p">720p</option>
                              <option value="480p">480p (data saver)</option>
                              <option value="360p">360p (low)</option>
                            </select>
                            {quality[m.id]?.label && (<>
                              <input type="file" accept={ACCEPT.video} style={{ margin: 0 }}
                                onChange={(e) => setQuality({ ...quality, [m.id]: { ...quality[m.id], file: e.target.files?.[0] } })} />
                              <button className="btn btn-sm" style={{ flex: '0 0 auto' }} disabled={quality[m.id]?.pct !== undefined}
                                onClick={() => addQuality(m)}>
                                {quality[m.id]?.pct !== undefined ? `${quality[m.id]?.pct}%` : 'Upload'}
                              </button>
                            </>)}
                          </div>
                        )}
                      </div>
                    ))}

                    {editable && (adding === s.id
                      ? <AddLesson sectionId={s.id} label={`in ${mi + 1}.${si + 1} ${s.title}`}
                          onAdded={(msg) => { setAdding(null); flash(msg); load(); }}
                          onCancel={() => setAdding(null)} />
                      : <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setAdding(s.id)}>+ Add lesson</button>
                    )}
                  </div>
                ))}

                {editable && (
                  <div className="row" style={{ maxWidth: 520, marginTop: 12 }}>
                    <input placeholder="New topic title (e.g. HTML & CSS Basics)" value={newTopic[cm.moduleId] ?? ''}
                      onChange={(e) => setNewTopic({ ...newTopic, [cm.moduleId]: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && newTopic[cm.moduleId]?.trim() && addTopic(cm.moduleId)} />
                    <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }}
                      disabled={!newTopic[cm.moduleId]?.trim()} onClick={() => addTopic(cm.moduleId)}>+ Add topic</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {editable && (
        <div className="card">
          <h2>📦 Add a module</h2>
          <div className="row">
            <input placeholder="Module title (e.g. Frontend Fundamentals)" value={newModule}
              onChange={(e) => setNewModule(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newModule.trim().length > 1 && addModule()} />
            <button className="btn" style={{ flex: '0 0 auto', marginTop: 4 }} onClick={addModule} disabled={newModule.trim().length < 2}>Create module</button>
          </div>
          {library.filter((m) => !course.courseModules.some((cm: any) => cm.moduleId === m.id)).length > 0 && (
            <div className="row">
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">…or reuse an existing module from the library</option>
                {library.filter((m) => !course.courseModules.some((cm: any) => cm.moduleId === m.id)).map((m) => (
                  <option key={m.id} value={m.id}>{m.title} ({m._count.sections} topics · used in {m._count.courseModules} courses)</option>
                ))}
              </select>
              <button className="btn btn-ghost" style={{ flex: '0 0 auto', marginTop: 4 }} onClick={linkModule} disabled={!linkId}>Link module</button>
            </div>
          )}
        </div>
      )}
    </>)}
  </>);
}

/* ─────────────────────────── ① Course details ─────────────────────────── */
function DetailsTab({ course, onSaved, onError }: { course: any; onSaved: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({
    title: course.title ?? '', description: course.description ?? '', categoryId: course.categoryId ?? '',
    isFree: !!course.isFree || Number(course.price) === 0, price: Number(course.price ?? 0),
  });
  const [cats, setCats] = useState<any[]>([]);
  const [newCat, setNewCat] = useState('');
  const [thumb, setThumb] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(course.thumbnailUrl ?? null);
  const [saving, setSaving] = useState(false);
  const loadCats = () => api('/api/categories').then((d) => setCats(d.categories)).catch(() => {});
  useEffect(() => { loadCats(); }, []);

  const addCat = async () => {
    try { const d = await api('/api/categories', { method: 'POST', json: { name: newCat.trim() } }); setNewCat(''); await loadCats(); setF({ ...f, categoryId: d.category.id }); }
    catch (e: any) { onError(e.message); }
  };
  const save = async () => {
    setSaving(true);
    try {
      const json: any = {
        title: f.title.trim(), description: f.description,
        isFree: f.isFree, price: f.isFree ? 0 : f.price,
        categoryId: f.categoryId || null,
      };
      if (thumb) json.thumbnailKey = await uploadFile(thumb, 'thumbnail');
      await api(`/api/courses/${course.id}`, { method: 'PATCH', json });
      setThumb(null); onSaved();
    } catch (e: any) { onError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div>
          <label>Course title</label>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <label>Short description (shown on the course page)</label>
          <textarea rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder="What will students learn? Who is it for? What will they build?" />
          <label>Category</label>
          <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">No category</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="row" style={{ maxWidth: 420 }}>
            <input placeholder="＋ Create a new category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }} disabled={newCat.trim().length < 2} onClick={addCat}>Add</button>
          </div>
        </div>
        <div>
          <label>Thumbnail (16:9, e.g. 1280×720)</label>
          <div style={{ width: '100%', maxWidth: 360, aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', margin: '6px 0',
            background: 'linear-gradient(135deg,#1E293B,#312E81)', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.5)', fontSize: '2rem' }}>
            {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
          </div>
          <input type="file" accept={ACCEPT.thumbnail} onChange={(e) => {
            const file = e.target.files?.[0] ?? null; setThumb(file); if (file) setPreview(URL.createObjectURL(file));
          }} />
          <label>Price</label>
          <div className="filter-chips" style={{ margin: '4px 0 10px' }}>
            <button type="button" className={`filter-chip${f.isFree ? ' active' : ''}`} onClick={() => setF({ ...f, isFree: true })}>🆓 Free</button>
            <button type="button" className={`filter-chip${!f.isFree ? ' active' : ''}`} onClick={() => setF({ ...f, isFree: false })}>💎 Paid</button>
          </div>
          {!f.isFree && (<>
            <label>Price for online purchase (₹)</label>
            <input type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
          </>)}
          <p className="muted" style={{ fontSize: '.8rem' }}>
            Offline fees for batch students are entered at enrolment time — this price is for the online catalog.
          </p>
        </div>
      </div>
      <button className="btn" onClick={save} disabled={saving || f.title.trim().length < 2}>{saving ? 'Saving…' : '💾 Save details'}</button>
    </div>
  );
}

/* ─────────────────────────── ③ Publish & settings ─────────────────────── */
function PublishTab({ course, stats, run, onDeleted, goto }: {
  course: any; stats: any; run: (fn: () => Promise<any>, msg?: string) => Promise<void>; onDeleted: () => void; goto: (t: Tab) => void;
}) {
  const checks = [
    { ok: !!course.description?.trim(), label: 'Description written', tab: 'details' as Tab },
    { ok: !!course.thumbnailKey, label: 'Thumbnail uploaded', tab: 'details' as Tab },
    { ok: stats.modules > 0, label: 'At least one module', tab: 'curriculum' as Tab },
    { ok: stats.lessons - stats.hidden > 0, label: 'At least one visible lesson (required)', tab: 'curriculum' as Tab },
    { ok: course.isFree || Number(course.price) > 0, label: 'Price set (or marked free)', tab: 'details' as Tab },
  ];
  const patch = (json: any, msg: string) => run(() => api(`/api/courses/${course.id}`, { method: 'PATCH', json }), msg);
  const canDelete = (course._count?.enrollments ?? 0) === 0 && course.batches.length === 0;

  return (<>
    <div className="card">
      <h2>✅ Ready to publish?</h2>
      <ul className="checklist">
        {checks.map((c) => (
          <li key={c.label}>
            <span className={c.ok ? 'yes' : 'no'}>{c.ok ? '✓' : '!'}</span>
            <span style={{ flex: 1 }}>{c.label}</span>
            {!c.ok && <button className="btn btn-ghost btn-sm" onClick={() => goto(c.tab)}>Fix</button>}
          </li>
        ))}
      </ul>
      <div className="actions">
        {course.status !== 'PUBLISHED'
          ? <button className="btn" disabled={stats.lessons - stats.hidden === 0} onClick={() => patch({ status: 'PUBLISHED' }, 'Course published 🎉')}>🚀 Publish</button>
          : <button className="btn btn-ghost" onClick={() => patch({ status: 'DRAFT' }, 'Moved back to draft')}>Unpublish (back to draft)</button>}
        {course.status !== 'ARCHIVED' && (
          <button className="btn btn-ghost" onClick={() => confirm('Archive this course? Enrolled students keep access, but it disappears from new enrolments.') && patch({ status: 'ARCHIVED' }, 'Course archived')}>🗄 Archive</button>
        )}
      </div>
    </div>

    <div className="card">
      <h2>🌐 Who can see it</h2>
      <div className="filter-chips">
        <button className={`filter-chip${course.visibility === 'PRIVATE' ? ' active' : ''}`} onClick={() => patch({ visibility: 'PRIVATE' }, 'Course is private')}>🔒 Private — only students you enrol</button>
        <button className={`filter-chip${course.visibility === 'PUBLIC' ? ' active' : ''}`} onClick={() => patch({ visibility: 'PUBLIC' }, 'Course is public')}>🌐 Public — listed in Explore / online purchase</button>
      </div>
      <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
        Public courses appear in the student “Explore Courses” catalog once published.
      </p>
    </div>

    <div className="card">
      <h2>🎓 Batches for this course</h2>
      {course.batches.length === 0 ? <p className="muted">No batches yet.</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Batch</th><th>Starts</th><th>Students</th><th></th></tr></thead>
          <tbody>{course.batches.map((b: any) => (
            <tr key={b.id}><td><b>{b.name}</b></td><td>{new Date(b.startDate).toLocaleDateString()}</td>
              <td>{b._count?.enrollments ?? 0}</td><td><Link href={`/admin/batches/${b.id}`}>Open →</Link></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Link className="btn btn-ghost btn-sm" href={`/admin/batches?courseId=${course.id}`} style={{ marginTop: 10 }}>+ Create a batch</Link>
    </div>

    <div className="card" style={{ borderColor: '#f5c2c2' }}>
      <h2>Danger zone</h2>
      {canDelete ? (
        <button className="btn btn-danger" onClick={async () => {
          if (!confirm(`Delete “${course.title}” permanently? Its modules stay in the library.`)) return;
          try { await api(`/api/courses/${course.id}`, { method: 'DELETE' }); onDeleted(); }
          catch (e: any) { alert(e.message); }
        }}>🗑 Delete course</button>
      ) : (
        <p className="muted" style={{ margin: 0 }}>This course has batches or students, so it can’t be deleted. Archive it instead.</p>
      )}
    </div>
  </>);
}
