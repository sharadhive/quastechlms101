'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';

export default function InstructorBatch() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<any>(null);
  const [expandedMods, setExpandedMods] = useState<Set<number>>(new Set());
  const [activeSession, setActiveSession] = useState('');
  const [roster, setRoster] = useState<any[]>([]);
  const [topicEdits, setTopicEdits] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [f, setF] = useState({ title: '', scheduledAt: '', meetLink: '' });
  const [saving, setSaving] = useState(false);
  const [savingTopics, setSavingTopics] = useState(false);
  const [tab, setTab] = useState<'topics' | 'attendance'>('topics');

  const load = useCallback(() => api(`/api/batches/${id}`).then((d) => {
    setB(d.batch);
    setExpandedMods(new Set(d.batch.curriculum.map((_: any, i: number) => i)));
  }), [id]);
  useEffect(() => { load(); }, [load]);

  const openSession = async (sessionId: string) => {
    setActiveSession(sessionId); setMsg(''); setErr(''); setTab('topics');
    const d = await api(`/api/sessions/${sessionId}/attendance`);
    setRoster(d.roster.map((r: any) => ({ ...r, present: r.present ?? true })));
    const s = b?.sessions?.find((s: any) => s.id === sessionId);
    setTopicEdits(new Set(s?.topicsCovered || d.topicsCovered || []));
  };

  const saveAttendance = async () => {
    setErr(''); setSaving(true);
    try {
      await api(`/api/sessions/${activeSession}/attendance`, {
        method: 'POST',
        json: { marks: roster.map((r) => ({ learnerId: r.id, present: r.present })) },
      });
      setMsg('Attendance saved ✓');
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  const saveTopics = async () => {
    setSavingTopics(true); setErr('');
    try {
      await api(`/api/sessions/${activeSession}/topics`, {
        method: 'PUT',
        json: { sectionIds: Array.from(topicEdits) },
      });
      setMsg('Topics updated ✓');
      load();
    } catch (e: any) { setErr(e.message); }
    setSavingTopics(false);
  };

  const createSession = async () => {
    setErr('');
    try {
      await api(`/api/batches/${id}/sessions`, {
        method: 'POST',
        json: { title: f.title, scheduledAt: new Date(f.scheduledAt).toISOString(), meetLink: f.meetLink || undefined },
      });
      setF({ title: '', scheduledAt: '', meetLink: '' });
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const toggleMod = (i: number) => {
    const next = new Set(expandedMods);
    next.has(i) ? next.delete(i) : next.add(i);
    setExpandedMods(next);
  };

  const toggleTopic = (sectionId: string) => {
    const next = new Set(topicEdits);
    next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
    setTopicEdits(next);
  };

  const markAllPresent = () => setRoster(roster.map((r) => ({ ...r, present: true })));
  const markAllAbsent = () => setRoster(roster.map((r) => ({ ...r, present: false })));

  if (!b) return <p className="muted" style={{ padding: 40, textAlign: 'center' }}>Loading batch…</p>;

  const presentCount = roster.filter((r) => r.present).length;
  const activeSessionData = b.sessions.find((s: any) => s.id === activeSession);
  const todaySessions = b.sessions.filter((s: any) => {
    const d = new Date(s.scheduledAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  return (<>
    {/* ── Batch Header ── */}
    <div className="card" style={{ background: 'linear-gradient(135deg, #312E81 0%, #1E293B 100%)', color: '#fff', border: 'none' }}>
      <h2 style={{ marginTop: 0, color: '#fff', fontSize: '1.2rem' }}>{b.name}</h2>
      <p style={{ color: '#94a3b8', margin: '4px 0 12px', fontSize: '.88rem' }}>{b.course.title}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {b.batchTime && <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>🕐 {b.batchTime}</span>}
        {b.schedule && <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>📅 {b.schedule}</span>}
        <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>👨‍🎓 {b.enrollments.length} Students</span>
        <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600 }}>📚 {b.sessions.length} Sessions</span>
      </div>
    </div>

    {/* ── Syllabus Progress ── */}
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>📚 Syllabus Coverage</h2>
        <span style={{ fontSize: '.82rem', fontWeight: 700, color: b.syllabusProgress === 100 ? 'var(--green)' : 'var(--brand)' }}>
          {b.coveredSections}/{b.totalSections} topics · {b.syllabusProgress}%
        </span>
      </div>
      <div className="progressbar" style={{ height: 10, marginBottom: 16 }}>
        <div style={{ width: `${b.syllabusProgress}%` }} />
      </div>

      {/* Collapsible Curriculum Tree */}
      {b.curriculum.map((mod: any, mi: number) => {
        const coveredInMod = mod.sections.filter((s: any) => s.covered).length;
        const totalInMod = mod.sections.length;
        const isOpen = expandedMods.has(mi);
        return (
          <div key={mi} className="curriculum-mod">
            <div className="curriculum-mod-head" onClick={() => toggleMod(mi)}>
              <span>📁 {mod.moduleTitle}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${coveredInMod === totalInMod ? 'green' : 'gray'}`}>
                  {coveredInMod}/{totalInMod} done
                </span>
                <span style={{ fontSize: '.8rem', transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </span>
            </div>
            {isOpen && (
              <div className="curriculum-mod-body">
                {mod.sections.map((sec: any) => (
                  <div key={sec.id} className="curriculum-sec">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem' }}>{sec.covered ? '✅' : '⬜'}</span>
                      <span style={{ opacity: sec.covered ? .65 : 1, textDecoration: sec.covered ? 'line-through' : 'none' }}>{sec.title}</span>
                    </span>
                    {sec.covered && <span className="badge green" style={{ fontSize: '.65rem' }}>Covered</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* ── Schedule New Session ── */}
    <div className="card">
      <h2 style={{ marginTop: 0 }}>➕ Schedule New Session</h2>
      <div className="row">
        <div><label>Session Title</label><input placeholder="e.g. HTML Forms & Validation" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label>Date & Time</label><input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></div>
        <div><label>Meet Link (optional)</label><input placeholder="Zoom/Meet URL" value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} /></div>
      </div>
      <button className="btn" onClick={createSession} disabled={!f.title || !f.scheduledAt}>Create Session</button>
    </div>

    {/* ── Today's Sessions Quick Access ── */}
    {todaySessions.length > 0 && (
      <div className="card" style={{ borderLeft: '4px solid var(--green)', background: 'var(--green-bg)' }}>
        <h2 style={{ marginTop: 0, color: 'var(--green)' }}>🟢 Today's Sessions</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {todaySessions.map((s: any) => (
            <button key={s.id} className={activeSession === s.id ? 'btn' : 'btn btn-ghost'}
              onClick={() => openSession(s.id)} style={{ fontSize: '.82rem' }}>
              {s.title} — {new Date(s.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* ── All Sessions List ── */}
    <div className="card">
      <h2 style={{ marginTop: 0 }}>📋 All Sessions</h2>
      {b.sessions.length === 0 ? (
        <div className="empty"><div className="big">📭</div>No sessions scheduled yet. Create one above.</div>
      ) : (
        <div className="tablewrap"><table>
          <thead><tr><th>Session</th><th>Date</th><th>Time</th><th>Topics</th><th>Attendance</th><th>Status</th><th></th></tr></thead>
          <tbody>{b.sessions.map((s: any) => {
            const dt = new Date(s.scheduledAt);
            const isActive = activeSession === s.id;
            return (
              <tr key={s.id} style={isActive ? { background: 'var(--brand-50)' } : {}}>
                <td><b>{s.title}</b></td>
                <td>{dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td>{dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                <td><span className={`badge ${s.topicsCovered.length > 0 ? 'blue' : 'gray'}`}>{s.topicsCovered.length} topics</span></td>
                <td><span className={`badge ${s.attendanceCount > 0 ? 'green' : 'gray'}`}>{s.attendanceCount} marked</span></td>
                <td>{s.startedAt ? <span className="badge green">Held</span> : <span className="badge amber">Upcoming</span>}</td>
                <td>
                  <button className={isActive ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
                    onClick={() => openSession(s.id)}>
                    {isActive ? '● Active' : 'Open →'}
                  </button>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>

    {/* ── Session Detail Panel (Topics + Attendance) ── */}
    {activeSession && activeSessionData && (
      <div className="card" style={{ border: '2px solid var(--brand)', boxShadow: '0 4px 20px rgba(124,58,237,.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>📝 {activeSessionData.title}</h2>
          <button className="btn-ghost btn btn-sm" onClick={() => setActiveSession('')}>✕ Close</button>
        </div>
        <p className="muted" style={{ margin: '0 0 16px' }}>
          📅 {new Date(activeSessionData.scheduledAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}
          🕐 {new Date(activeSessionData.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f3f8', borderRadius: 10, padding: 3 }}>
          <button onClick={() => setTab('topics')}
            style={{
              flex: 1, padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: '.85rem', fontFamily: 'inherit', transition: 'all .15s',
              background: tab === 'topics' ? '#fff' : 'transparent',
              color: tab === 'topics' ? 'var(--brand)' : 'var(--muted)',
              boxShadow: tab === 'topics' ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            }}>
            📚 Topics Covered ({topicEdits.size})
          </button>
          <button onClick={() => setTab('attendance')}
            style={{
              flex: 1, padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: '.85rem', fontFamily: 'inherit', transition: 'all .15s',
              background: tab === 'attendance' ? '#fff' : 'transparent',
              color: tab === 'attendance' ? 'var(--brand)' : 'var(--muted)',
              boxShadow: tab === 'attendance' ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            }}>
            ✋ Attendance ({presentCount}/{roster.length})
          </button>
        </div>

        {/* Topics Tab */}
        {tab === 'topics' && (
          <div>
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '0 0 12px' }}>
              Tick the topics you taught in this session. Click on a module to expand it.
            </p>
            {b.curriculum.map((mod: any, mi: number) => (
              <div key={mi} style={{ marginBottom: 8 }}>
                <div style={{
                  fontWeight: 700, fontSize: '.86rem', padding: '8px 12px',
                  background: '#fafbfe', borderRadius: '8px 8px 0 0', border: '1px solid var(--border)',
                  borderBottom: 'none',
                }}>
                  📁 {mod.moduleTitle}
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                    ({mod.sections.filter((s: any) => topicEdits.has(s.id)).length}/{mod.sections.length} selected)
                  </span>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', padding: '4px 0' }}>
                  {mod.sections.map((sec: any) => {
                    const isChecked = topicEdits.has(sec.id);
                    return (
                      <label key={sec.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer',
                        fontSize: '.86rem', fontWeight: 400, transition: 'background .1s',
                        background: isChecked ? 'rgba(124,58,237,.04)' : 'transparent',
                        borderLeft: isChecked ? '3px solid var(--brand)' : '3px solid transparent',
                      }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = isChecked ? 'rgba(124,58,237,.06)' : '#fafbfe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isChecked ? 'rgba(124,58,237,.04)' : 'transparent')}>
                        <input type="checkbox" style={{ width: 'auto', margin: 0, accentColor: 'var(--brand)' }}
                          checked={isChecked} onChange={() => toggleTopic(sec.id)} />
                        <span>{sec.title}</span>
                        {sec.covered && !isChecked && <span className="badge gray" style={{ marginLeft: 'auto', fontSize: '.6rem' }}>Already covered in another session</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {err && <div className="err">{err}</div>}
            {msg && <div className="ok">{msg}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="btn" onClick={saveTopics} disabled={savingTopics}>
                {savingTopics ? 'Saving…' : `💾 Save Topics (${topicEdits.size} selected)`}
              </button>
              <span className="muted" style={{ fontSize: '.78rem' }}>Date & time auto-recorded when you save</span>
            </div>
          </div>
        )}

        {/* Attendance Tab */}
        {tab === 'attendance' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <button className="btn btn-sm btn-ghost" onClick={markAllPresent}>✅ Mark All Present</button>
              <button className="btn btn-sm btn-ghost" onClick={markAllAbsent}>❌ Mark All Absent</button>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: '.82rem' }}>
                {presentCount} present · {roster.length - presentCount} absent
              </span>
            </div>
            {roster.length === 0 ? (
              <div className="empty"><div className="big">👥</div>No students enrolled in this batch.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                {roster.map((r, idx) => (
                  <label key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 10, cursor: 'pointer', transition: 'all .12s',
                    background: r.present ? 'var(--green-bg)' : 'var(--red-bg)',
                    border: `1.5px solid ${r.present ? 'var(--green)' : 'var(--red)'}`,
                    borderColor: r.present ? 'rgba(14,159,110,.25)' : 'rgba(224,36,36,.2)',
                  }}>
                    <input type="checkbox" style={{ width: 'auto', margin: 0, accentColor: 'var(--green)' }} checked={r.present}
                      onChange={(e) => setRoster(roster.map((x) => x.id === r.id ? { ...x, present: e.target.checked } : x))} />
                    <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', minWidth: 22 }}>{idx + 1}.</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.86rem' }}>{r.name}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
                    </div>
                    <span style={{ fontSize: '.82rem', fontWeight: 700, color: r.present ? 'var(--green)' : 'var(--red)' }}>
                      {r.present ? 'P' : 'A'}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
            {msg && <div className="ok" style={{ marginTop: 12 }}>{msg}</div>}
            <button className="btn" onClick={saveAttendance} disabled={saving || roster.length === 0} style={{ marginTop: 14 }}>
              {saving ? 'Saving…' : `💾 Save Attendance (${presentCount}/${roster.length} present)`}
            </button>
          </div>
        )}
      </div>
    )}
  </>);
}
