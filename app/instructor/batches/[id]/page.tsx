'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';

export default function InstructorBatch() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<any>(null);
  const [expandedMods, setExpandedMods] = useState<Set<number>>(new Set());
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingTopic, setTogglingTopic] = useState<string | null>(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    moduleId: '', sectionId: '', title: '', scheduledAt: '', meetLink: '',
  });

  // ── Load batch data ──
  const load = useCallback(() => api(`/api/batches/${id}`).then((d) => {
    setB(d.batch);
    setExpandedMods(new Set(d.batch.curriculum.map((_: any, i: number) => i)));
  }), [id]);
  useEffect(() => { load(); }, [load]);

  // ── Toggle topic complete/incomplete ──
  const toggleTopicComplete = async (sectionId: string, currentlyCompleted: boolean) => {
    setTogglingTopic(sectionId); setErr(''); setMsg('');
    try {
      await api(`/api/batches/${id}/topics`, {
        method: 'PUT',
        json: { sectionId, completed: !currentlyCompleted },
      });
      setMsg(!currentlyCompleted ? 'Topic marked as complete ✓' : 'Topic unmarked');
      await load();
    } catch (e: any) { setErr(e.message); }
    setTogglingTopic(null);
  };

  // ── Open attendance drawer for a topic ──
  const openAttendance = async (sectionId: string) => {
    if (expandedTopic === sectionId) {
      setExpandedTopic(null);
      setRoster([]);
      return;
    }
    setExpandedTopic(sectionId);
    setRosterLoading(true); setErr(''); setMsg('');
    try {
      const d = await api(`/api/batches/${id}/topic-attendance?sectionId=${sectionId}`);
      setRoster(d.roster.map((r: any) => ({
        ...r,
        present: r.present ?? true, // default new marks to present
      })));
    } catch (e: any) { setErr(e.message); }
    setRosterLoading(false);
  };

  // ── Save attendance for expanded topic ──
  const saveAttendance = async () => {
    if (!expandedTopic) return;
    setSaving(true); setErr(''); setMsg('');
    try {
      await api(`/api/batches/${id}/topic-attendance`, {
        method: 'POST',
        json: {
          sectionId: expandedTopic,
          marks: roster.map((r) => ({ learnerId: r.id, present: r.present })),
        },
      });
      setMsg('Attendance saved ✓');
      await load();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  // ── Create session with optional module/topic ──
  const createSession = async () => {
    setErr('');
    try {
      await api(`/api/batches/${id}/sessions`, {
        method: 'POST',
        json: {
          title: sessionForm.title || undefined,
          scheduledAt: new Date(sessionForm.scheduledAt).toISOString(),
          meetLink: sessionForm.meetLink || undefined,
          moduleId: sessionForm.moduleId || undefined,
          sectionId: sessionForm.sectionId || undefined,
        },
      });
      setSessionForm({ moduleId: '', sectionId: '', title: '', scheduledAt: '', meetLink: '' });
      setMsg('Session created ✓');
      await load();
    } catch (e: any) { setErr(e.message); }
  };

  // ── Helpers ──
  const toggleMod = (i: number) => {
    const next = new Set(expandedMods);
    next.has(i) ? next.delete(i) : next.add(i);
    setExpandedMods(next);
  };
  const markAllPresent = () => setRoster(roster.map((r) => ({ ...r, present: true })));
  const markAllAbsent = () => setRoster(roster.map((r) => ({ ...r, present: false })));

  const selectedModuleSections = sessionForm.moduleId
    ? b?.curriculum?.find((m: any) => m.moduleId === sessionForm.moduleId)?.sections || []
    : [];

  if (!b) return <p className="muted" style={{ padding: 40, textAlign: 'center' }}>Loading batch…</p>;

  const presentCount = roster.filter((r) => r.present).length;

  return (<>
    {/* ── Batch Header ── */}
    <div className="card" style={{ background: 'linear-gradient(135deg, #312E81 0%, #1E293B 100%)', color: '#fff', border: 'none' }}>
      <h2 style={{ marginTop: 0, color: '#fff', fontSize: '1.2rem' }}>{b.name}</h2>
      <p style={{ color: '#94a3b8', margin: '4px 0 12px', fontSize: '.88rem' }}>{b.course.title}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {b.batchTime && <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>🕐 {b.batchTime}</span>}
        {b.schedule && <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>📅 {b.schedule}</span>}
        <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>👨‍🎓 {b.enrollments.length} Students</span>
        <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>📚 {b.coveredSections}/{b.totalSections} Topics Done</span>
      </div>
    </div>

    {/* ── Syllabus Progress Bar ── */}
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>📚 Syllabus Progress</h2>
        <span style={{ fontSize: '.82rem', fontWeight: 700, color: b.syllabusProgress === 100 ? 'var(--green)' : 'var(--brand)' }}>
          {b.syllabusProgress}% Complete
        </span>
      </div>
      <div className="progressbar" style={{ height: 10 }}>
        <div style={{ width: `${b.syllabusProgress}%` }} />
      </div>
    </div>

    {/* ── Status Messages ── */}
    {err && <div className="card err" style={{ border: '1px solid var(--red)', background: 'var(--red-bg)' }}>{err}</div>}
    {msg && <div className="card ok" style={{ border: '1px solid var(--green)', background: 'var(--green-bg)' }}>{msg}</div>}

    {/* ── Modules & Topics (Main Section) ── */}
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0 }}>📋 Course Topics</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: '.78rem' }}>
          Check topics when completed · Click a topic row to mark attendance
        </p>
      </div>

      {b.curriculum.map((mod: any, mi: number) => {
        const coveredInMod = mod.sections.filter((s: any) => s.covered).length;
        const totalInMod = mod.sections.length;
        const pct = totalInMod > 0 ? Math.round((coveredInMod / totalInMod) * 100) : 0;
        const isOpen = expandedMods.has(mi);

        return (
          <div key={mi}>
            {/* Module Header */}
            <div className="module-head" onClick={() => toggleMod(mi)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="module-icon">📁</span>
                <span>{mod.moduleTitle}</span>
              </span>
              <span className="module-stats">
                <span className={`badge ${coveredInMod === totalInMod && totalInMod > 0 ? 'green' : 'gray'}`}>
                  {coveredInMod}/{totalInMod}
                </span>
                <div className="module-progress">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <span className={`module-chevron ${isOpen ? 'open' : ''}`}>▼</span>
              </span>
            </div>

            {/* Topics List */}
            {isOpen && mod.sections.map((sec: any) => {
              const isExpanded = expandedTopic === sec.id;
              const isToggling = togglingTopic === sec.id;

              return (
                <div key={sec.id}>
                  {/* Topic Row */}
                  <div className={`topic-row ${sec.covered ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}`}>
                    {/* Checkbox */}
                    <div
                      className={`topic-checkbox ${sec.covered ? 'checked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleTopicComplete(sec.id, sec.covered); }}
                      style={isToggling ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                    >
                      <span className="check-icon">✓</span>
                    </div>

                    {/* Topic Info — click to open attendance */}
                    <div className="topic-info" onClick={() => openAttendance(sec.id)}>
                      <div className={`topic-title ${sec.covered ? 'done' : ''}`}>
                        {sec.title}
                      </div>
                      {sec.coveredAt && (
                        <div className="topic-sub">
                          Completed on {new Date(sec.coveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="topic-badges" onClick={() => openAttendance(sec.id)}>
                      {sec.coveredAt && (
                        <span className="topic-date-badge">
                          📅 {new Date(sec.coveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {sec.attendance ? (
                        <span className="topic-att-badge has-data">
                          ✋ {sec.attendance.present}/{sec.attendance.total}
                        </span>
                      ) : sec.covered ? (
                        <span className="topic-att-badge no-data">No attendance</span>
                      ) : null}
                      <span className={`topic-expand-icon ${isExpanded ? 'open' : ''}`}>▼</span>
                    </div>
                  </div>

                  {/* Attendance Drawer */}
                  <div className={`att-drawer ${isExpanded ? 'open' : ''}`}>
                    {isExpanded && (
                      <div className="att-drawer-inner">
                        <div className="att-drawer-head">
                          <h3>✋ Attendance — {sec.title}</h3>
                          <div className="att-drawer-actions">
                            <button className="btn btn-sm btn-ghost" onClick={markAllPresent}>✅ All Present</button>
                            <button className="btn btn-sm btn-ghost" onClick={markAllAbsent}>❌ All Absent</button>
                            <span className="muted" style={{ fontSize: '.78rem' }}>
                              {presentCount}/{roster.length}
                            </span>
                          </div>
                        </div>

                        {rosterLoading ? (
                          <p className="muted" style={{ textAlign: 'center', padding: 20 }}>Loading students…</p>
                        ) : roster.length === 0 ? (
                          <div className="empty"><div className="big">👥</div>No students enrolled in this batch.</div>
                        ) : (
                          <div className="student-grid">
                            {roster.map((r, idx) => (
                              <div
                                key={r.id}
                                className={`student-toggle ${r.present ? 'present' : 'absent'}`}
                                onClick={() => setRoster(roster.map((x) => x.id === r.id ? { ...x, present: !x.present } : x))}
                              >
                                <div className="radio"><div className="radio-dot" /></div>
                                <span className="snum">{idx + 1}.</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="sname">{r.name}</div>
                                  <div className="semail">{r.email}</div>
                                </div>
                                <span className="pa-label">{r.present ? 'P' : 'A'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button className="btn" onClick={saveAttendance} disabled={saving || roster.length === 0}>
                            {saving ? 'Saving…' : `💾 Save Attendance (${presentCount}/${roster.length})`}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setExpandedTopic(null); setRoster([]); }}>
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>

    {/* ── Quick Session Assignment (Optional) ── */}
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setShowSessionForm(!showSessionForm)}
      >
        <h2 style={{ margin: 0 }}>➕ Assign Session (Optional)</h2>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)', transition: 'transform .2s', transform: showSessionForm ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
      </div>

      {showSessionForm && (
        <div style={{ marginTop: 16 }}>
          <p className="muted" style={{ margin: '0 0 14px', fontSize: '.78rem' }}>
            Create a scheduled session and optionally link it to a module or specific topic.
          </p>
          <div className="row">
            <div>
              <label>Module (optional)</label>
              <select
                value={sessionForm.moduleId}
                onChange={(e) => setSessionForm({ ...sessionForm, moduleId: e.target.value, sectionId: '' })}
              >
                <option value="">— Select Module —</option>
                {b.curriculum.map((m: any) => (
                  <option key={m.moduleId} value={m.moduleId}>{m.moduleTitle}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Topic (optional)</label>
              <select
                value={sessionForm.sectionId}
                onChange={(e) => setSessionForm({ ...sessionForm, sectionId: e.target.value })}
                disabled={!sessionForm.moduleId}
              >
                <option value="">— All topics in module —</option>
                {selectedModuleSections.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div>
              <label>Session Title (auto-generated if empty)</label>
              <input
                placeholder="e.g. HTML Forms & Validation"
                value={sessionForm.title}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
              />
            </div>
            <div>
              <label>Date & Time</label>
              <input
                type="datetime-local"
                value={sessionForm.scheduledAt}
                onChange={(e) => setSessionForm({ ...sessionForm, scheduledAt: e.target.value })}
              />
            </div>
            <div>
              <label>Meet Link (optional)</label>
              <input
                placeholder="Zoom/Meet URL"
                value={sessionForm.meetLink}
                onChange={(e) => setSessionForm({ ...sessionForm, meetLink: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" onClick={createSession} disabled={!sessionForm.scheduledAt}>
            Create Session
          </button>
        </div>
      )}
    </div>

    {/* ── Sessions Reference (Collapsible) ── */}
    {b.sessions.length > 0 && (
      <details className="card" style={{ cursor: 'default' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.92rem', padding: '4px 0' }}>
          📋 All Sessions ({b.sessions.length}) — click to expand
        </summary>
        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Session</th><th>Date</th><th>Topics</th><th>Attendance</th><th>Status</th></tr></thead>
            <tbody>{b.sessions.map((s: any) => {
              const dt = new Date(s.scheduledAt);
              return (
                <tr key={s.id}>
                  <td><b>{s.title}</b></td>
                  <td>{dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td><span className={`badge ${s.topicsCovered.length > 0 ? 'blue' : 'gray'}`}>{s.topicsCovered.length} topics</span></td>
                  <td><span className={`badge ${s.attendanceCount > 0 ? 'green' : 'gray'}`}>{s.attendanceCount} marked</span></td>
                  <td>{s.startedAt ? <span className="badge green">Held</span> : <span className="badge amber">Upcoming</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </details>
    )}
  </>);
}
