'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useMe } from '@/lib/client/useMe';
import { Empty } from '@/components/ui';
import AttendanceEditor, { AttendanceList } from '@/components/AttendanceEditor';

type Tab = 'take' | 'syllabus' | 'classes' | 'students';

const dShort = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dTime = (d: string | Date) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const localDate = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

export default function InstructorBatch() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const [b, setB] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('take');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');

  const load = useCallback(() => api(`/api/batches/${id}`).then((d) => setB(d.batch)).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const done = (m: string) => { setMsg(m); setErr(''); load(); };
  const fail = (m: string) => { setErr(m); setMsg(''); };

  if (err && !b) return <div className="card err">{err}</div>;
  if (!b) return <p className="muted" style={{ padding: 40, textAlign: 'center' }}>Loading batch…</p>;

  const now = new Date();
  const held = b.sessions.filter((s: any) => (s.attendance?.total ?? 0) > 0).length;
  const next = b.sessions.find((s: any) => new Date(s.scheduledAt) > now);

  return (<>
    <div className="card">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}><Link href="/instructor/batches">← My Batches</Link></div>
          <h1 style={{ marginTop: 4 }}>{b.name}</h1>
          <div className="sub">
            {b.course.title}{b.batchTime ? ` · 🕐 ${b.batchTime}` : ''}{b.schedule ? ` · ${b.schedule.toLowerCase()} batch` : ''}
          </div>
        </div>
        {tab !== 'take' && <button className="btn" onClick={() => setTab('take')}>✅ Take today&apos;s class</button>}
      </div>
      <div className="ib-stats">
        <div className="ib-stat">
          <span className="lbl">Syllabus taught</span>
          <b>{b.coveredSections} of {b.totalSections} topics</b>
          <div className="progressbar"><div style={{ width: `${b.syllabusProgress}%` }} /></div>
        </div>
        <div className="ib-stat"><span className="lbl">Students</span><b>{b.enrollments.length}</b></div>
        <div className="ib-stat"><span className="lbl">Classes with attendance</span><b>{held}</b></div>
        <div className="ib-stat"><span className="lbl">Next scheduled class</span><b>{next ? dTime(next.scheduledAt) : 'None'}</b></div>
      </div>
      <div className="tabs" style={{ marginBottom: 0 }}>
        <button className={tab === 'take' ? 'active' : ''} onClick={() => setTab('take')}>✅ Take a class</button>
        <button className={tab === 'syllabus' ? 'active' : ''} onClick={() => setTab('syllabus')}>📚 Syllabus ({b.coveredSections}/{b.totalSections})</button>
        <button className={tab === 'classes' ? 'active' : ''} onClick={() => setTab('classes')}>📅 Classes ({b.sessions.length})</button>
        <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>👥 Students ({b.enrollments.length})</button>
      </div>
    </div>

    {err && <div className="card err" style={{ border: '1px solid var(--red)', background: 'var(--red-bg)' }}>⚠ {err}</div>}
    {msg && <div className="card ok" style={{ border: '1px solid var(--green)', background: 'var(--green-bg)' }}>{msg}</div>}

    {tab === 'take' && <TakeClass b={b} onSaved={done} onError={fail} />}
    {tab === 'syllabus' && <Syllabus b={b} batchId={id} onDone={done} onError={fail} goTake={() => setTab('take')} />}
    {tab === 'classes' && <Classes b={b} batchId={id} canSchedule={!!me?.permissions.create_sessions} onDone={done} onError={fail} />}
    {tab === 'students' && <Students b={b} batchId={id} />}
  </>);
}

/* ───────────── ✅ Take a class: topics + attendance in ONE save ───────────── */
function TakeClass({ b, onSaved, onError }: { b: any; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const topics = useMemo(() => b.curriculum.flatMap((m: any, mi: number) =>
    m.sections.map((s: any, si: number) => ({ ...s, num: `${mi + 1}.${si + 1}`, module: m.moduleTitle }))), [b]);
  const pending = topics.filter((t: any) => !t.covered);
  const suggested = pending.slice(0, 4);
  const today = new Date();
  const todaysScheduled = b.sessions.filter((s: any) => sameDay(new Date(s.scheduledAt), today) && !(s.attendance?.total > 0));

  const [picked, setPicked] = useState<string[]>([]);
  const [rows, setRows] = useState(b.enrollments.map((e: any) => ({ id: e.learner.id, name: e.learner.name, email: e.learner.email, present: true })));
  const [sessionId, setSessionId] = useState<string>(todaysScheduled[0]?.id ?? '');
  const [date, setDate] = useState(localDate());
  const [saving, setSaving] = useState(false);

  const toggle = (sid: string) => setPicked(picked.includes(sid) ? picked.filter((x) => x !== sid) : [...picked, sid]);
  const titleOf = (sid: string) => topics.find((t: any) => t.id === sid)?.title ?? '';
  const presentCount = rows.filter((r: any) => r.present).length;

  const save = async () => {
    setSaving(true);
    try {
      const isToday = date === localDate();
      const r = await api(`/api/batches/${b.id}/class-log`, {
        method: 'POST',
        json: {
          sectionIds: picked,
          marks: rows.map((x: any) => ({ learnerId: x.id, present: x.present })),
          ...(sessionId ? { sessionId } : {}),
          ...(!sessionId && !isToday ? { heldAt: new Date(`${date}T12:00:00`).toISOString() } : {}),
        },
      });
      setPicked([]);
      setRows(rows.map((x: any) => ({ ...x, present: true })));
      onSaved(`Class saved ✓ — “${r.topics.join('”, “')}” marked as taught · ${r.present} of ${r.total} students present`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) { onError(e.message); } finally { setSaving(false); }
  };

  return (<>
    <div className="step-card">
      <h3><span className="num">1</span> What did you teach in this class?</h3>
      <p className="help">Tick the topic(s). The next topics of the syllabus are suggested first.</p>
      <div className="body">
        {suggested.length > 0 ? (
          <div className="pick-list">
            {suggested.map((t: any) => (
              <button key={t.id} className={`pick ${picked.includes(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)}>
                <span className="box">{picked.includes(t.id) ? '✓' : ''}</span>
                <span>{t.num} {t.title}<small>{t.module}</small></span>
              </button>
            ))}
          </div>
        ) : <p className="ok" style={{ marginTop: 0 }}>🎉 Every topic of the syllabus has been taught. You can still log revision classes below.</p>}
        <select value="" onChange={(e) => e.target.value && !picked.includes(e.target.value) && setPicked([...picked, e.target.value])} style={{ maxWidth: 520 }}>
          <option value="">＋ Pick another topic from the full syllabus…</option>
          {b.curriculum.map((m: any, mi: number) => (
            <optgroup key={m.moduleId} label={`Module ${mi + 1} · ${m.moduleTitle}`}>
              {m.sections.map((s: any, si: number) => (
                <option key={s.id} value={s.id}>{mi + 1}.{si + 1} {s.title}{s.covered ? '  (already taught)' : ''}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {picked.length > 0 && (
          <div className="sel-chips">
            {picked.map((sid) => <span key={sid}>{titleOf(sid)}<button onClick={() => toggle(sid)} title="Remove">✕</button></span>)}
          </div>
        )}
      </div>
    </div>

    <div className="step-card">
      <h3><span className="num">2</span> Who was present?</h3>
      <p className="help">Everyone starts as <b>Present</b>. Tap a student to mark them <b>Absent</b>.</p>
      <div className="body"><AttendanceList rows={rows} onChange={setRows} /></div>
    </div>

    <div className="step-card">
      <h3><span className="num">3</span> When was the class? Then save</h3>
      <div className="body">
        {todaysScheduled.length > 0 && (<>
          <label>This class is</label>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} style={{ maxWidth: 520 }}>
            {todaysScheduled.map((s: any) => <option key={s.id} value={s.id}>Today&apos;s scheduled class — {s.title} ({new Date(s.scheduledAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })})</option>)}
            <option value="">A different / extra class</option>
          </select>
        </>)}
        {!sessionId && (<>
          <label>Class date</label>
          <input type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
        </>)}
        <div className="hint" style={{ marginTop: 4 }}>
          Saving will mark <b>{picked.length || 'no'}</b> topic{picked.length === 1 ? '' : 's'} as taught and record attendance
          (<b>{presentCount} of {rows.length}</b> present).
        </div>
        <button className="btn" onClick={save} disabled={saving || picked.length === 0}>
          {saving ? 'Saving…' : picked.length === 0 ? 'Tick at least one topic in step 1' : '💾 Save class'}
        </button>
      </div>
    </div>
  </>);
}

/* ───────────── 📚 Syllabus: clear status + explicit buttons ───────────── */
function Syllabus({ b, batchId, onDone, onError, goTake }: {
  b: any; batchId: string; onDone: (m: string) => void; onError: (m: string) => void; goTake: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'done' | 'noatt'>('all');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const all = b.curriculum.flatMap((m: any) => m.sections);
  const counts = {
    all: all.length,
    pending: all.filter((s: any) => !s.covered).length,
    done: all.filter((s: any) => s.covered).length,
    noatt: all.filter((s: any) => s.covered && !s.attendance).length,
  };
  const show = (s: any) => filter === 'all' || (filter === 'pending' && !s.covered) || (filter === 'done' && s.covered) || (filter === 'noatt' && s.covered && !s.attendance);

  const setTaught = async (s: any, completed: boolean) => {
    if (!completed && !confirm(`Mark “${s.title}” as NOT taught?${s.attendance ? '\nThe attendance for that class is kept.' : ''}`)) return;
    setBusy(s.id);
    try {
      await api(`/api/batches/${batchId}/topics`, { method: 'PUT', json: { sectionId: s.id, completed } });
      onDone(completed ? `“${s.title}” marked as taught — add attendance if you have it` : `“${s.title}” marked as not taught`);
    } catch (e: any) { onError(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="card">
      <div className="hint">
        <b>Tip:</b> the quickest way is <a href="#" onClick={(e) => { e.preventDefault(); goTake(); }}>✅ Take a class</a> — it marks topics
        and attendance together. Use this list to see progress, fix attendance, or undo a topic.
      </div>
      <div className="filterbar">
        <div className="filter-chips">
          {([['all', 'All topics'], ['pending', 'Not taught yet'], ['done', 'Taught'], ['noatt', 'Attendance missing']] as const).map(([k, l]) => (
            <button key={k} className={`filter-chip${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l} ({counts[k]})</button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setClosed(closed.size ? new Set() : new Set(b.curriculum.map((m: any) => m.moduleId)))}>
          {closed.size ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {b.curriculum.length === 0 && <Empty icon="📚" text="This course has no topics yet." />}
      {b.curriculum.map((m: any, mi: number) => {
        const visible = m.sections.filter(show);
        if (filter !== 'all' && visible.length === 0) return null;
        const doneN = m.sections.filter((s: any) => s.covered).length;
        const isOpen = !closed.has(m.moduleId);
        return (
          <div className="ib-mod" key={m.moduleId}>
            <div className="ib-mod-head" onClick={() => {
              const n = new Set(closed); n.has(m.moduleId) ? n.delete(m.moduleId) : n.add(m.moduleId); setClosed(n);
            }}>
              <span>{isOpen ? '▾' : '▸'}</span>
              <span style={{ flex: 1 }}>Module {mi + 1} · {m.moduleTitle}</span>
              <span className={`badge ${doneN === m.sections.length && doneN > 0 ? 'green' : 'gray'}`}>{doneN}/{m.sections.length} taught</span>
              <span className="mini"><div style={{ width: `${m.sections.length ? (doneN / m.sections.length) * 100 : 0}%` }} /></span>
            </div>
            {isOpen && visible.map((s: any) => {
              const si = m.sections.indexOf(s);
              return (
                <div key={s.id}>
                  <div className={`ib-topic ${s.covered ? 'done' : ''}`}>
                    <span className="st">{s.covered ? '✓' : si + 1}</span>
                    <div className="grow">
                      <b>{mi + 1}.{si + 1} {s.title}</b>
                      <div className="s">
                        {!s.covered ? 'Not taught yet' : (<>
                          Taught on {dShort(s.coveredAt)} ·{' '}
                          {s.attendance
                            ? <>{s.attendance.present} of {s.attendance.total} present</>
                            : <span className="warn">attendance not taken</span>}
                        </>)}
                      </div>
                    </div>
                    <div className="actions" style={{ gap: 6 }}>
                      {!s.covered && (
                        <button className="btn btn-ghost btn-sm" disabled={busy === s.id} onClick={() => setTaught(s, true)}>✓ Mark as taught</button>
                      )}
                      {s.covered && (
                        <button className={`btn btn-sm ${s.attendance ? 'btn-ghost' : ''}`} onClick={() => setEditing(editing === s.id ? null : s.id)}>
                          {s.attendance ? '✋ Edit attendance' : '✋ Take attendance'}
                        </button>
                      )}
                      {s.covered && <button className="linkbtn" disabled={busy === s.id} onClick={() => setTaught(s, false)}>Undo</button>}
                    </div>
                  </div>
                  {editing === s.id && (
                    <AttendanceEditor
                      title={s.title}
                      load={() => api(`/api/batches/${batchId}/topic-attendance?sectionId=${s.id}`)}
                      save={(marks) => api(`/api/batches/${batchId}/topic-attendance`, { method: 'POST', json: { sectionId: s.id, marks } })}
                      onClose={() => setEditing(null)}
                      onSaved={(m2) => { setEditing(null); onDone(`${s.title}: ${m2}`); }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── 📅 Classes: schedule, upcoming, past ───────────── */
function Classes({ b, batchId, canSchedule, onDone, onError }: {
  b: any; batchId: string; canSchedule: boolean; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [f, setF] = useState({ sectionId: '', title: '', scheduledAt: '', meetLink: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [resched, setResched] = useState<{ id: string; at: string } | null>(null);
  const now = Date.now();
  const upcoming = b.sessions.filter((s: any) => new Date(s.scheduledAt).getTime() > now - 2 * 3600_000 && !(s.attendance?.total > 0));
  const past = b.sessions.filter((s: any) => !upcoming.includes(s)).slice().reverse();

  const run = async (fn: () => Promise<any>, m: string) => { try { await fn(); onDone(m); } catch (e: any) { onError(e.message); } };
  const schedule = () => run(async () => {
    await api(`/api/batches/${batchId}/sessions`, { method: 'POST', json: {
      title: f.title || undefined, scheduledAt: new Date(f.scheduledAt).toISOString(),
      meetLink: f.meetLink || undefined, sectionId: f.sectionId || undefined,
    } });
    setF({ sectionId: '', title: '', scheduledAt: '', meetLink: '' });
  }, 'Class scheduled ✓ — students get reminders 24 h and 1 h before');
  const startAndJoin = async (s: any) => {
    const w = s.meetLink ? window.open('', '_blank') : null;
    try {
      await api(`/api/sessions/${s.id}/start`, { method: 'POST' });
      if (w && s.meetLink) w.location.href = s.meetLink;
      onDone(`“${s.title}” started. After class, use ✅ Take a class to save topics and attendance.`);
    } catch (e: any) { w?.close(); onError(e.message); }
  };

  return (<>
    <div className="card">
      <h2>📅 Schedule a class</h2>
      {!canSchedule ? (
        <div className="hint warn" style={{ marginBottom: 0 }}>
          Scheduling needs the <b>“Schedule their own classes”</b> permission — ask an admin. Admins can also schedule classes for you.
        </div>
      ) : (<>
        <div className="row">
          <div><label>Date &amp; time</label><input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></div>
          <div><label>Topic (optional)</label>
            <select value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
              <option value="">— no specific topic —</option>
              {b.curriculum.map((m: any, mi: number) => (
                <optgroup key={m.moduleId} label={`Module ${mi + 1} · ${m.moduleTitle}`}>
                  {m.sections.map((s: any) => <option key={s.id} value={s.id}>{s.title}{s.covered ? ' (taught)' : ''}</option>)}
                </optgroup>
              ))}
            </select></div>
        </div>
        <div className="row">
          <div><label>Title (optional — uses the topic name)</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Doubt-clearing session" /></div>
          <div><label>Zoom / Google Meet link (optional)</label><input value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} placeholder="https://…" /></div>
        </div>
        <button className="btn" onClick={schedule} disabled={!f.scheduledAt}>Schedule class</button>
      </>)}
    </div>

    <div className="card">
      <h2>Upcoming classes</h2>
      {upcoming.length === 0 ? <Empty icon="🗓️" text="No upcoming classes scheduled" /> : upcoming.map((s: any) => (
        <div className="ib-topic" key={s.id} style={{ borderTop: 0, borderBottom: '1px solid var(--border)' }}>
          <span className="st" style={{ fontSize: '.7rem' }}>📅</span>
          <div className="grow">
            <b>{s.title}</b>
            <div className="s">{dTime(s.scheduledAt)}{s.topicTitles?.length ? ` · ${s.topicTitles.join(', ')}` : ''}{s.startedAt ? ' · started' : ''}</div>
            {resched && resched.id === s.id && (
              <div className="actions" style={{ marginTop: 6 }}>
                <input type="datetime-local" value={resched.at} onChange={(e) => setResched({ id: s.id, at: e.target.value })} style={{ margin: 0, maxWidth: 220 }} />
                <button className="btn btn-sm" disabled={!resched.at} onClick={() => {
                  const at = resched.at;
                  run(async () => {
                    await api(`/api/sessions/${s.id}`, { method: 'PATCH', json: { scheduledAt: new Date(at).toISOString() } }); setResched(null);
                  }, 'Class moved ✓ — reminders updated');
                }}>Save</button>
                <button className="linkbtn" onClick={() => setResched(null)}>cancel</button>
              </div>
            )}
          </div>
          <div className="actions" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={() => startAndJoin(s)}>{s.meetLink ? '▶ Start & join' : '▶ Start class'}</button>
            {canSchedule && <button className="btn btn-ghost btn-sm" onClick={() => setResched({ id: s.id, at: '' })}>Reschedule</button>}
            {canSchedule && <button className="linkbtn" onClick={() => confirm(`Cancel “${s.title}”?`) && run(() => api(`/api/sessions/${s.id}`, { method: 'DELETE' }), 'Class cancelled')}>Cancel</button>}
          </div>
        </div>
      ))}
    </div>

    <div className="card">
      <h2>Past classes</h2>
      {past.length === 0 ? <Empty icon="📖" text="No classes held yet" /> : past.map((s: any) => (
        <div key={s.id}>
          <div className="ib-topic" style={{ borderTop: 0, borderBottom: '1px solid var(--border)' }}>
            <span className="st" style={s.attendance ? { background: 'var(--green)', borderColor: 'var(--green)', color: '#fff' } : {}}>{s.attendance ? '✓' : '!'}</span>
            <div className="grow">
              <b>{s.title}</b>
              <div className="s">
                {dShort(s.scheduledAt)}{s.topicTitles?.length ? ` · topics: ${s.topicTitles.join(', ')}` : ''} ·{' '}
                {s.attendance ? <>{s.attendance.present} of {s.attendance.total} present</> : <span className="warn">attendance not taken</span>}
              </div>
            </div>
            <button className={`btn btn-sm ${s.attendance ? 'btn-ghost' : ''}`} onClick={() => setEditing(editing === s.id ? null : s.id)}>
              {s.attendance ? '✋ Edit attendance' : '✋ Take attendance'}
            </button>
          </div>
          {editing === s.id && (
            <AttendanceEditor
              title={`${s.title} (${dShort(s.scheduledAt)})`}
              load={() => api(`/api/sessions/${s.id}/attendance`)}
              save={(marks) => api(`/api/sessions/${s.id}/attendance`, { method: 'POST', json: { marks } })}
              onClose={() => setEditing(null)}
              onSaved={(m2) => { setEditing(null); onDone(m2); }}
            />
          )}
        </div>
      ))}
    </div>
  </>);
}

/* ───────────── 👥 Students: attendance % + course progress ───────────── */
function Students({ b, batchId }: { b: any; batchId: string }) {
  const [rep, setRep] = useState<any>(null);
  useEffect(() => { api(`/api/reports/attendance?batchId=${batchId}`).then(setRep).catch(() => setRep({ report: [], totalSessions: 0 })); }, [batchId]);
  const progress = new Map(b.enrollments.map((e: any) => [e.learner.id, Number(e.progressPct)]));
  if (!rep) return <div className="card"><p className="muted">Loading…</p></div>;
  const rows = [...rep.report].sort((a: any, c: any) => a.name.localeCompare(c.name));
  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>
        Attendance counts the {rep.totalSessions} class{rep.totalSessions === 1 ? '' : 'es'} where attendance was taken. Below 75% is flagged.
      </p>
      {rows.length === 0 ? <Empty icon="👥" text="No students in this batch yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Student</th><th>Attendance</th><th>Course progress (videos, notes, quizzes)</th></tr></thead>
          <tbody>{rows.map((r: any, i: number) => (
            <tr key={r.id}>
              <td className="muted">{i + 1}</td>
              <td><b>{r.name}</b>{r.email && <><br /><span className="muted" style={{ fontSize: '.78rem' }}>{r.email}</span></>}</td>
              <td>
                {r.pct === null ? <span className="muted">—</span> : (
                  <span className={`badge ${r.low ? 'red' : 'green'}`}>{r.pct}% · {r.present}/{r.totalSessions}</span>
                )}
              </td>
              <td style={{ minWidth: 180 }}>
                <div className="progressbar"><div style={{ width: `${progress.get(r.id) ?? 0}%` }} /></div>
                <span className="muted" style={{ fontSize: '.78rem' }}>{Math.round(Number(progress.get(r.id) ?? 0))}%</span>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
