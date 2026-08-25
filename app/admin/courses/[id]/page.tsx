'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, uploadFile } from '@/lib/client/api';

const TYPE_ICON: Record<string, string> = { VIDEO: '🎬', PDF: '📄', QUIZ: '❓', ASSIGNMENT: '📝', LINK: '🔗' };

interface QQ { text: string; options: string[]; correct: number[]; marks: number; negative: number; }
const newQ = (): QQ => ({ text: '', options: ['', ''], correct: [], marks: 1, negative: 0 });

function QuizBuilder({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const q = value ?? { timeLimitMin: 10, attemptsAllowed: 1, showAnswers: true, questions: [newQ()] };
  const set = (patch: any) => onChange({ ...q, ...patch });
  const setQ = (i: number, patch: Partial<QQ>) =>
    set({ questions: q.questions.map((x: QQ, xi: number) => (xi === i ? { ...x, ...patch } : x)) });
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: '8px 0' }}>
      <div className="row">
        <div><label>Time limit (min)</label><input type="number" value={q.timeLimitMin} onChange={(e) => set({ timeLimitMin: Number(e.target.value) })} /></div>
        <div><label>Attempts allowed</label><input type="number" value={q.attemptsAllowed} onChange={(e) => set({ attemptsAllowed: Number(e.target.value) })} /></div>
        <div><label>Show answers after</label><select value={q.showAnswers ? 'y' : 'n'} onChange={(e) => set({ showAnswers: e.target.value === 'y' })}><option value="y">Yes</option><option value="n">No</option></select></div>
      </div>
      {q.questions.map((qq: QQ, i: number) => (
        <div key={i} style={{ background: 'var(--brand-50)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div className="row">
            <input placeholder={`Question ${i + 1}`} value={qq.text} onChange={(e) => setQ(i, { text: e.target.value })} />
            <button className="iconbtn" title="Remove question" onClick={() => set({ questions: q.questions.filter((_: QQ, xi: number) => xi !== i) })}>✕</button>
          </div>
          {qq.options.map((opt, oi) => (
            <div className="row" key={oi} style={{ alignItems: 'center' }}>
              <label style={{ flex: '0 0 auto', fontWeight: 400 }}>
                <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={qq.correct.includes(oi)}
                  onChange={(e) => setQ(i, { correct: e.target.checked ? [...qq.correct, oi] : qq.correct.filter((c) => c !== oi) })} /> correct
              </label>
              <input placeholder={`Option ${oi + 1}`} value={opt}
                onChange={(e) => setQ(i, { options: qq.options.map((o, xo) => (xo === oi ? e.target.value : o)) })} />
              {qq.options.length > 2 && (
                <button className="iconbtn" onClick={() => setQ(i, { options: qq.options.filter((_, xo) => xo !== oi), correct: qq.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)) })}>✕</button>
              )}
            </div>
          ))}
          <div className="row">
            <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => setQ(i, { options: [...qq.options, ''] })}>+ Option</button>
            <div><label>Marks</label><input type="number" value={qq.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} /></div>
            <div><label>Negative</label><input type="number" step="0.5" value={qq.negative} onChange={(e) => setQ(i, { negative: Number(e.target.value) })} /></div>
          </div>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => set({ questions: [...q.questions, newQ()] })}>+ Add question</button>
    </div>
  );
}

export default function CourseBuilder() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<any>(null);
  const [library, setLibrary] = useState<any[]>([]);
  const [openMods, setOpenMods] = useState<Record<string, boolean>>({});
  const [newModule, setNewModule] = useState(''); const [linkModuleId, setLinkModuleId] = useState('');
  const [secTitle, setSecTitle] = useState<Record<string, string>>({});
  const [mat, setMat] = useState<Record<string, any>>({});
  const [qual, setQual] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  // ── settings state ──
  const [showSettings, setShowSettings] = useState(false);
  const [desc, setDesc] = useState('');
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [coursePrice, setCoursePrice] = useState(0);
  const [isFree, setIsFree] = useState(false);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const load = () => Promise.all([
    api(`/api/courses/${id}`).then((d) => {
      setCourse(d.course);
      // populate settings from loaded course
      setDesc(d.course.description ?? '');
      setCoursePrice(Number(d.course.price ?? 0));
      setIsFree(d.course.isFree ?? false);
      setVisibility(d.course.visibility ?? 'PRIVATE');
    }),
    api('/api/modules').then((d) => setLibrary(d.modules)),
  ]);
  useEffect(() => { load(); }, [id]);

  // ── resolve thumbnail preview URL ──
  useEffect(() => {
    if (course?.thumbnailUrl && !thumbFile) {
      setThumbPreview(course.thumbnailUrl);
    }
  }, [course?.thumbnailUrl]);

  // ── save settings ──
  const saveSettings = async () => {
    setSettingsSaving(true); setErr(''); setOk('');
    try {
      let thumbnailKey: string | undefined;
      if (thumbFile) {
        thumbnailKey = await uploadFile(thumbFile, 'thumbnail');
      }
      const json: any = {
        description: desc || undefined,
        price: isFree ? 0 : coursePrice,
        isFree,
        visibility,
      };
      if (thumbnailKey) json.thumbnailKey = thumbnailKey;
      await api(`/api/courses/${id}`, { method: 'PATCH', json });
      setThumbFile(null);
      setOk('Settings saved ✓');
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSettingsSaving(false); }
  };

  const handleThumbSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbFile(file);
      setThumbPreview(URL.createObjectURL(file));
    }
  };

  // ── structure actions ──
  const createModule = async () => {
    const d = await api('/api/modules', { method: 'POST', json: { title: newModule } });
    await api(`/api/courses/${id}/modules`, { method: 'POST', json: { moduleId: d.module.id, position: course.courseModules.length } });
    setNewModule(''); setOk('Module added'); load();
  };
  const linkModule = async () => {
    await api(`/api/courses/${id}/modules`, { method: 'POST', json: { moduleId: linkModuleId, position: course.courseModules.length } });
    setLinkModuleId(''); load();
  };
  const moveModule = async (i: number, dir: -1 | 1) => {
    const a = course.courseModules[i], b = course.courseModules[i + dir];
    if (!b) return;
    await api(`/api/modules/${a.moduleId}`, { method: 'PATCH', json: { courseId: id, position: b.position } });
    await api(`/api/modules/${b.moduleId}`, { method: 'PATCH', json: { courseId: id, position: a.position } });
    load();
  };
  const renameModule = async (moduleId: string, title: string) => {
    const t = prompt('Rename module', title); if (!t) return;
    await api(`/api/modules/${moduleId}`, { method: 'PATCH', json: { title: t } }); load();
  };
  const removeModule = async (moduleId: string) => {
    if (!confirm('Remove this module from the course? (It stays in the Module Library)')) return;
    await api(`/api/modules/${moduleId}?courseId=${id}`, { method: 'DELETE' }); load();
  };
  const addSection = async (moduleId: string, count: number) => {
    await api(`/api/modules/${moduleId}/sections`, { method: 'POST', json: { title: secTitle[moduleId], position: count } });
    setSecTitle({ ...secTitle, [moduleId]: '' }); load();
  };
  const moveSection = async (sections: any[], i: number, dir: -1 | 1) => {
    const a = sections[i], b = sections[i + dir]; if (!b) return;
    await api(`/api/sections/${a.id}`, { method: 'PATCH', json: { position: b.position } });
    await api(`/api/sections/${b.id}`, { method: 'PATCH', json: { position: a.position } });
    load();
  };
  const renameSection = async (s: any) => {
    const t = prompt('Rename section', s.title); if (!t) return;
    await api(`/api/sections/${s.id}`, { method: 'PATCH', json: { title: t } }); load();
  };
  const removeSection = async (s: any) => {
    if (!confirm(`Delete section “${s.title}” and all its materials?`)) return;
    await api(`/api/sections/${s.id}`, { method: 'DELETE' }); load();
  };
  const moveMaterial = async (mats: any[], i: number, dir: -1 | 1) => {
    const a = mats[i], b = mats[i + dir]; if (!b) return;
    await api(`/api/materials/${a.id}`, { method: 'PATCH', json: { position: b.position } });
    await api(`/api/materials/${b.id}`, { method: 'PATCH', json: { position: a.position } });
    load();
  };
  const renameMaterial = async (m: any) => {
    const t = prompt('Rename material', m.title); if (!t) return;
    await api(`/api/materials/${m.id}`, { method: 'PATCH', json: { title: t } }); load();
  };
  const removeMaterial = async (m: any) => {
    if (!confirm(`Delete “${m.title}”?`)) return;
    await api(`/api/materials/${m.id}`, { method: 'DELETE' }); load();
  };

  const addMaterial = async (sectionId: string, count: number) => {
    const m = mat[sectionId] ?? {}; setErr(''); setOk('');
    try {
      let fileKey: string | undefined;
      const type = m.type ?? 'VIDEO';
      if ((type === 'VIDEO' || type === 'PDF') && m.file) {
        setBusy(sectionId);
        fileKey = await uploadFile(m.file, 'material', (pct) => setBusy(`${sectionId}:${pct}`));
      }
      const json: any = { type, title: m.title, position: count, fileKey, sizeBytes: m.file?.size };
      if (type === 'QUIZ') {
        const quiz = m.quiz ?? { questions: [] };
        const questions = (quiz.questions ?? [])
          .filter((q: QQ) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2 && q.correct.length > 0)
          .map((q: QQ, qi: number) => ({ id: `q${qi + 1}`, text: q.text, options: q.options.filter((o) => o.trim()), correct: q.correct, marks: q.marks || 1, negative: q.negative || 0 }));
        if (!questions.length) throw new Error('Each question needs text, 2+ options and a ticked correct answer');
        json.quizSchema = { timeLimitMin: quiz.timeLimitMin || undefined, attemptsAllowed: quiz.attemptsAllowed || 1, shuffle: true, showAnswers: quiz.showAnswers ?? true, questions };
      }
      if (type === 'LINK') json.externalUrl = m.url;
      await api(`/api/sections/${sectionId}/materials`, { method: 'POST', json });
      setMat({ ...mat, [sectionId]: {} }); setOk('Material added ✓'); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };

  /** Upload an extra quality version (e.g. 480p) of an existing video. */
  const addQuality = async (materialId: string) => {
    const qv = qual[materialId] ?? {}; setErr(''); setOk('');
    if (!qv.file || !qv.label) { setErr('Choose a quality label and a file'); return; }
    try {
      setBusy(`q:${materialId}`);
      const fileKey = await uploadFile(qv.file, 'material', (pct) => setBusy(`q:${materialId}:${pct}`));
      await api(`/api/materials/${materialId}/variants`, { method: 'POST', json: {
        label: qv.label, heightPx: Number(qv.label.replace(/\D/g, '')) || 480, fileKey, sizeBytes: qv.file.size } });
      setQual({ ...qual, [materialId]: {} }); setOk('Quality version added ✓'); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };

  const publish = async () => { await api(`/api/courses/${id}`, { method: 'PATCH', json: { status: 'PUBLISHED' } }); load(); };

  if (!course) return <p className="muted">Loading…</p>;
  const totalMaterials = course.courseModules.reduce((a: number, cm: any) =>
    a + cm.module.sections.reduce((b: number, s: any) => b + s.materials.length, 0), 0);

  return (<>
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{course.title} <span className={`badge ${course.status === 'PUBLISHED' ? 'green' : 'amber'}`}>{course.status}</span></h2>
          <span className="muted">{course.courseModules.length} modules · {totalMaterials} materials</span>
        </div>
        {course.status !== 'PUBLISHED' && <button className="btn" onClick={publish} disabled={totalMaterials === 0}>Publish course</button>}
      </div>
      <div className="stepper" style={{ marginTop: 12 }}>
        <span className="step">1 · Add a module (subject)</span>
        <span className="step">2 · Add sections (chapters)</span>
        <span className="step">3 · Add materials in order</span>
        <span className="step">4 · Publish</span>
      </div>
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    </div>

    {/* ── Course Settings Panel ── */}
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setShowSettings(!showSettings)}>
        <h2 style={{ margin: 0 }}>⚙️ Course Settings</h2>
        <span style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>{showSettings ? '▾' : '▸'}</span>
      </div>
      {showSettings && (
        <div style={{ marginTop: 16 }}>
          {/* Thumbnail */}
          <div style={{ marginBottom: 16 }}>
            <label>Course Thumbnail</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 6 }}>
              <div style={{
                width: 200, height: 120, borderRadius: 12, overflow: 'hidden',
                background: 'linear-gradient(135deg, #1E293B, #312E81)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,.4)', fontSize: '2rem', flexShrink: 0,
                border: '2px dashed var(--border-strong)',
              }}>
                {thumbPreview
                  ? <img src={thumbPreview} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '📷'}
              </div>
              <div>
                <input type="file" accept="image/*" onChange={handleThumbSelect} style={{ marginBottom: 6 }} />
                <div className="muted" style={{ fontSize: '.76rem' }}>Recommended: 800×450px (16:9). JPG or PNG.</div>
                {thumbFile && <div className="ok" style={{ fontSize: '.78rem' }}>New image selected — save to upload</div>}
              </div>
            </div>
          </div>

          {/* Description */}
          <label>Description</label>
          <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe what students will learn in this course…"
            style={{ resize: 'vertical' }} />

          {/* Price & Free/Paid */}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div>
              <label>Pricing</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 12 }}>
                <button className={`filter-chip${isFree ? ' active' : ''}`}
                  onClick={() => { setIsFree(true); setCoursePrice(0); }} type="button">🆓 Free</button>
                <button className={`filter-chip${!isFree ? ' active' : ''}`}
                  onClick={() => setIsFree(false)} type="button">💎 Paid</button>
              </div>
            </div>
            {!isFree && (
              <div>
                <label>Price (₹)</label>
                <input type="number" min={0} step={1} value={coursePrice}
                  onChange={(e) => setCoursePrice(Number(e.target.value))} placeholder="e.g. 4999" />
              </div>
            )}
            <div>
              <label>Visibility</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                <option value="PRIVATE">🔒 Private (internal only)</option>
                <option value="PUBLIC">🌐 Public (shows in catalog)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button className="btn" onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving ? 'Saving…' : '💾 Save Settings'}
            </button>
            <span className="muted" style={{ fontSize: '.78rem' }}>
              {isFree ? 'Students can enroll for free' : coursePrice > 0 ? `Students pay ₹${coursePrice.toLocaleString('en-IN')}` : 'Set a price or mark as free'}
            </span>
          </div>
        </div>
      )}
    </div>

    <div className="card">
      <h2>➕ Add module</h2>
      <div className="row">
        <input placeholder="New module title (e.g. Frontend Fundamentals)" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
        <button className="btn" style={{ flex: '0 0 auto' }} onClick={createModule} disabled={newModule.length < 2}>Create &amp; attach</button>
      </div>
      <div className="row">
        <select value={linkModuleId} onChange={(e) => setLinkModuleId(e.target.value)}>
          <option value="">…or reuse a module from the library</option>
          {library.map((m) => <option key={m.id} value={m.id}>{m.title} (used in {m._count.courseModules})</option>)}
        </select>
        <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={linkModule} disabled={!linkModuleId}>Link module</button>
      </div>
    </div>

    {course.courseModules.map((cm: any, mi: number) => {
      const open = openMods[cm.moduleId] ?? true;
      return (
        <div className="builder-mod" key={cm.moduleId}>
          <div className="builder-head">
            <span onClick={() => setOpenMods({ ...openMods, [cm.moduleId]: !open })} style={{ flex: 1 }}>
              {open ? '▾' : '▸'} <span className="seq">{mi + 1}.</span> 📦 {cm.module.title}
              <span className="muted" style={{ fontWeight: 400 }}> · {cm.module.sections.length} sections</span>
            </span>
            <button className="iconbtn" disabled={mi === 0} title="Move up" onClick={() => moveModule(mi, -1)}>↑</button>
            <button className="iconbtn" disabled={mi === course.courseModules.length - 1} title="Move down" onClick={() => moveModule(mi, 1)}>↓</button>
            <button className="iconbtn" title="Rename" onClick={() => renameModule(cm.moduleId, cm.module.title)}>✎</button>
            <button className="iconbtn" title="Remove from course" onClick={() => removeModule(cm.moduleId)}>✕</button>
          </div>

          {open && (
            <div className="builder-body">
              {cm.module.sections.map((s: any, si: number) => (
                <div className="builder-sec" key={s.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <b style={{ flex: 1 }}><span className="seq">{mi + 1}.{si + 1}</span> § {s.title}</b>
                    <button className="iconbtn" disabled={si === 0} title="Move up" onClick={() => moveSection(cm.module.sections, si, -1)}>↑</button>
                    <button className="iconbtn" disabled={si === cm.module.sections.length - 1} title="Move down" onClick={() => moveSection(cm.module.sections, si, 1)}>↓</button>
                    <button className="iconbtn" title="Rename" onClick={() => renameSection(s)}>✎</button>
                    <button className="iconbtn" title="Delete section" onClick={() => removeSection(s)}>✕</button>
                  </div>

                  {s.materials.map((m: any, xi: number) => (
                    <div key={m.id}>
                      <div className="mat-row">
                        <span className="seq">{mi + 1}.{si + 1}.{xi + 1}</span>
                        <span>{TYPE_ICON[m.type] ?? '📎'}</span>
                        <span className="grow">{m.title}</span>
                        {m.type === 'VIDEO' && m.variants?.length > 0 && <span className="badge blue">{m.variants.length} qualities</span>}
                        <span className={`badge ${m.status === 'published' ? 'green' : 'amber'}`}>{m.status}</span>
                        <button className="iconbtn" disabled={xi === 0} title="Move up" onClick={() => moveMaterial(s.materials, xi, -1)}>↑</button>
                        <button className="iconbtn" disabled={xi === s.materials.length - 1} title="Move down" onClick={() => moveMaterial(s.materials, xi, 1)}>↓</button>
                        <button className="iconbtn" title="Rename" onClick={() => renameMaterial(m)}>✎</button>
                        <button className="iconbtn" title="Delete" onClick={() => removeMaterial(m)}>✕</button>
                      </div>
                      {m.type === 'VIDEO' && (
                        <div className="row" style={{ margin: '0 0 8px 44px', maxWidth: 560, alignItems: 'center' }}>
                          <select value={qual[m.id]?.label ?? ''} onChange={(e) => setQual({ ...qual, [m.id]: { ...qual[m.id], label: e.target.value } })} style={{ maxWidth: 150 }}>
                            <option value="">+ Add quality…</option>
                            <option value="1080p">1080p (HD)</option>
                            <option value="720p">720p</option>
                            <option value="480p">480p (data saver)</option>
                            <option value="360p">360p (low)</option>
                          </select>
                          {qual[m.id]?.label && (<>
                            <input type="file" accept="video/*" onChange={(e) => setQual({ ...qual, [m.id]: { ...qual[m.id], file: e.target.files?.[0] } })} />
                            <button className="btn btn-sm" style={{ flex: '0 0 auto' }} disabled={busy.startsWith(`q:${m.id}`)} onClick={() => addQuality(m.id)}>
                              {busy.startsWith(`q:${m.id}`) ? `${busy.split(':')[2] ?? 0}%` : 'Upload'}
                            </button>
                          </>)}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* add material */}
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 10, marginTop: 8 }}>
                    <div className="row">
                      <select value={mat[s.id]?.type ?? 'VIDEO'} onChange={(e) => setMat({ ...mat, [s.id]: { ...mat[s.id], type: e.target.value } })} style={{ maxWidth: 170 }}>
                        <option value="VIDEO">🎬 Video</option><option value="PDF">📄 PDF / notes</option>
                        <option value="QUIZ">❓ Quiz</option><option value="ASSIGNMENT">📝 Assignment</option><option value="LINK">🔗 Link</option>
                      </select>
                      <input placeholder="Material title" value={mat[s.id]?.title ?? ''} onChange={(e) => setMat({ ...mat, [s.id]: { ...mat[s.id], title: e.target.value } })} />
                    </div>
                    {(mat[s.id]?.type === 'VIDEO' || mat[s.id]?.type === 'PDF' || !mat[s.id]?.type) &&
                      <input type="file" onChange={(e) => setMat({ ...mat, [s.id]: { ...mat[s.id], file: e.target.files?.[0] } })} />}
                    {mat[s.id]?.type === 'QUIZ' && <QuizBuilder value={mat[s.id]?.quiz} onChange={(quiz) => setMat({ ...mat, [s.id]: { ...mat[s.id], quiz } })} />}
                    {mat[s.id]?.type === 'LINK' && <input placeholder="https://…" value={mat[s.id]?.url ?? ''} onChange={(e) => setMat({ ...mat, [s.id]: { ...mat[s.id], url: e.target.value } })} />}
                    <button className="btn btn-sm" onClick={() => addMaterial(s.id, s.materials.length)} disabled={!mat[s.id]?.title || busy.startsWith(s.id)}>
                      {busy.startsWith(s.id) ? `Uploading ${busy.split(':')[1] ?? ''}%` : `+ Add as ${mi + 1}.${si + 1}.${s.materials.length + 1}`}
                    </button>
                  </div>
                </div>
              ))}

              <div className="row" style={{ maxWidth: 460, marginTop: 10 }}>
                <input placeholder="New section title (e.g. HTML &amp; CSS)" value={secTitle[cm.moduleId] ?? ''} onChange={(e) => setSecTitle({ ...secTitle, [cm.moduleId]: e.target.value })} />
                <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={() => addSection(cm.moduleId, cm.module.sections.length)} disabled={!secTitle[cm.moduleId]}>+ Add section</button>
              </div>
            </div>
          )}
        </div>
      );
    })}
  </>);
}
