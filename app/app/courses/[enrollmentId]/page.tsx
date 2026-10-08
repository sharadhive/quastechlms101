'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, uploadFile, ACCEPT } from '@/lib/client/api';
import { formatBytes } from '@/lib/utils/files';

const TYPE_ICON: Record<string, string> = { VIDEO: '🎬', PDF: '📄', QUIZ: '❓', ASSIGNMENT: '📝', LINK: '🔗', LIVE: '📡' };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Player() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const [data, setData] = useState<any>(null);
  const [loadErr, setLoadErr] = useState('');
  const [active, setActive] = useState<any>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [quiz, setQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [quizResult, setQuizResult] = useState<any>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [assignFile, setAssignFile] = useState<File | undefined>();
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [tab, setTab] = useState<'content' | 'qna' | 'notes'>('content');
  const [qna, setQna] = useState<any[]>([]); const [qText, setQText] = useState('');
  const [notes, setNotes] = useState<any[]>([]); const [nText, setNText] = useState('');
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [stalls, setStalls] = useState(0);
  const [autoNote, setAutoNote] = useState('');
  const [pdfExpanded, setPdfExpanded] = useState(false);
  const [downloadable, setDownloadable] = useState(false);

  // ── Video watch tracking: a video completes by itself once 90% of it was really played ──
  const [watch, setWatch] = useState<any>(null);       // latest watch state from the server
  const watchedRef = useRef<Set<number>>(new Set());   // seconds played in this sitting
  const lastTimeRef = useRef<number | null>(null);     // previous playback position
  const lastSentRef = useRef(0);                       // when the last report was sent
  const activeRef = useRef<any>(null);                 // current lesson, for async callbacks

  const load = () => api(`/api/me/courses/${enrollmentId}`).then((d) => { setData(d); return d; }).catch((e) => setLoadErr(e.message));

  // Flat, ordered list of lessons (with their topic) — drives numbering and Next/Previous
  const lessons = useMemo(() => {
    const out: any[] = [];
    if (!data) return out;
    data.course.courseModules.forEach((cm: any, mi: number) =>
      cm.module.sections.forEach((s: any, si: number) =>
        s.materials.forEach((m: any, xi: number) => out.push({ ...m, num: `${mi + 1}.${si + 1}.${xi + 1}`, topic: s.title }))));
    return out;
  }, [data]);
  const doneSet = new Set((data?.completed ?? []).map((c: any) => c.materialId));
  const idx = active ? lessons.findIndex((l) => l.id === active.id) : -1;

  // On first load open the first lesson that isn't done yet
  useEffect(() => {
    load().then((d: any) => {
      if (!d) return;
      const flat: any[] = [];
      d.course.courseModules.forEach((cm: any) => cm.module.sections.forEach((s: any) => s.materials.forEach((m: any) => flat.push(m))));
      const done = new Set(d.completed.map((c: any) => c.materialId));
      const first = flat.find((m) => !done.has(m.id)) ?? flat[0];
      if (first) select(first);
    });
  }, [enrollmentId]);

  // Block Ctrl+P/S/C on notes / PDFs (casual copy protection only)
  useEffect(() => {
    const isPdf = tab === 'content' && active?.type === 'PDF' && !downloadable;
    if (tab !== 'notes' && !isPdf) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, active, downloadable]);

  // Quiz countdown (the server enforces the real limit)
  useEffect(() => {
    if (!quiz?.endsAt) { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, Math.round((new Date(quiz.endsAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [quiz]);

  const courseId = data?.course?.id;
  const loadSide = (m: any) => {
    if (!courseId && !data) return;
    api(`/api/qna?courseId=${data?.course.id ?? ''}&materialId=${m.id}`).then((d) => setQna(d.questions)).catch(() => {});
    api(`/api/notes?materialId=${m.id}`).then((d) => setNotes(d.notes)).catch(() => {});
  };

  /** Seconds played → compact [start, end) ranges. */
  const toRanges = (set: Set<number>): [number, number][] => {
    const out: [number, number][] = [];
    for (const sec of [...set].sort((a, b) => a - b)) {
      const last = out[out.length - 1];
      if (last && sec <= last[1]) last[1] = Math.max(last[1], sec + 1);
      else out.push([sec, sec + 1]);
    }
    return out;
  };

  /** Report what was played. The server marks the video complete once 90% is covered. */
  const sendWatch = async (materialId: string, v?: HTMLVideoElement | null) => {
    lastSentRef.current = Date.now();
    try {
      const r = await api('/api/progress/watch', {
        method: 'POST',
        json: {
          enrollmentId, materialId,
          ranges: toRanges(watchedRef.current),
          durationSec: v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined,
          positionSec: v ? v.currentTime : undefined,
        },
      });
      if (r.justCompleted) await load(); // tick the lesson and refresh the progress bar
      if (activeRef.current?.id !== materialId) return; // moved on to another lesson meanwhile
      setWatch(r);
      if (r.justCompleted)
        setMsg(r.progress?.progressPct >= 100 ? '🎉 Course completed! Your certificate will appear under Certificates.' : 'Video completed ✓');
    } catch { /* offline or busy — the next report carries everything again */ }
  };

  // Leaving the lesson view (Q&A / Notes tab): report what was played so far
  useEffect(() => {
    lastTimeRef.current = null;
    const a = activeRef.current;
    if (tab !== 'content' && a?.type === 'VIDEO' && watchedRef.current.size > 0) sendWatch(a.id);
  }, [tab]);

  // Closing the page or leaving the course: report once more so no watched time is lost
  useEffect(() => {
    const flush = () => {
      const a = activeRef.current;
      if (!a || a.type !== 'VIDEO' || watchedRef.current.size === 0) return;
      fetch('/api/progress/watch', {
        method: 'POST', keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, materialId: a.id, ranges: toRanges(watchedRef.current) }),
      }).catch(() => {});
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [enrollmentId]);

  function select(m: any) {
    // leaving a video: report what was played, then start clean for the next lesson
    const leaving = activeRef.current;
    if (leaving && leaving.id !== m.id) {
      if (leaving.type === 'VIDEO' && watchedRef.current.size > 0) sendWatch(leaving.id);
      watchedRef.current = new Set();
      setWatch(null);
    }
    lastTimeRef.current = null;
    activeRef.current = m;
    setActive(m); setStreamUrl(''); setQuiz(null); setQuizResult(null); setMsg(''); setErr(''); setTab('content');
    setAssignFile(undefined); setPdfExpanded(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (m.type === 'VIDEO' || m.type === 'PDF') {
      api(`/api/materials/${m.id}/stream-url`).then((d) => {
        setStreamUrl(d.url);
        setDownloadable(!!d.isDownloadable);
        setVariants(d.variants ?? []);
        setVariantId(null);
        setStalls(0); setAutoNote('');
        // Auto-quality: on a slow connection start with the lowest available version
        const conn: any = (navigator as any).connection;
        const slow = conn && (conn.saveData || ['slow-2g', '2g', '3g'].includes(conn.effectiveType));
        const lowest = (d.variants ?? []).filter((v: any) => v.id).sort((a: any, b: any) => a.heightPx - b.heightPx)[0];
        if (slow && lowest) { setAutoNote(`Slow connection detected — playing ${lowest.label}`); switchQuality(m.id, lowest.id); }
      }).catch((e) => setErr(e.message));
    }
  }
  useEffect(() => { if (active && data) loadSide(active); }, [active?.id, data?.course?.id]);

  /** Switch video quality WITHOUT losing the current position. */
  const switchQuality = async (materialId: string, vId: string | null) => {
    const at = videoRef?.currentTime ?? 0;
    const playing = videoRef ? !videoRef.paused : false;
    try {
      const d = await api(`/api/materials/${materialId}/stream-url${vId ? `?variantId=${vId}` : ''}`);
      setVariantId(vId);
      setStreamUrl(d.url);
      setTimeout(() => {
        if (videoRef) {
          videoRef.currentTime = at;
          videoRef.playbackRate = speed;
          if (playing) videoRef.play().catch(() => {});
        }
      }, 80);
    } catch (e: any) { setErr(e.message); }
  };

  /** Repeated buffering → step down one quality level automatically. */
  const onStall = () => {
    const next = stalls + 1;
    setStalls(next);
    if (next < 3) return;
    const cur = variants.find((x) => x.id === variantId)?.heightPx ?? 9999;
    const lower = variants.filter((v) => v.id && v.heightPx < cur).sort((a, b) => b.heightPx - a.heightPx)[0];
    if (lower) {
      setAutoNote(`Buffering — switched to ${lower.label} for smoother playback`);
      setStalls(0);
      switchQuality(active.id, lower.id);
    }
  };

  const markDone = async (silent = false) => {
    if (!active) return;
    try {
      const r = await api('/api/progress', { method: 'POST', json: { enrollmentId, materialId: active.id } });
      if (!silent) setMsg(r.progressPct >= 100 ? '🎉 Course completed! Your certificate will appear under Certificates.' : 'Marked complete ✓');
      await load();
    } catch (e: any) { if (!silent) setErr(e.message); }
  };

  const startQuiz = async () => {
    setErr('');
    try { setQuiz(await api(`/api/quiz/${active.id}/attempt`, { method: 'POST' })); setAnswers({}); }
    catch (e: any) { setErr(e.message); }
  };
  const submitQuiz = async () => {
    setErr('');
    try {
      const r = await api(`/api/quiz/${active.id}/submit`, { method: 'POST', json: { answers } });
      setQuizResult(r); setQuiz(null); await markDone(true);
    } catch (e: any) { setErr(e.message); }
  };
  const submitAssignment = async () => {
    setErr('');
    try {
      setUploadPct(0);
      const key = await uploadFile(assignFile!, 'assignment', setUploadPct);
      const r = await api(`/api/assignments/${active.id}/submit`, { method: 'POST', json: { fileKey: key } });
      setMsg(`Submitted${r.isLate ? ' (after the due date)' : ''} ✓ — your instructor will evaluate it.`);
      setAssignFile(undefined);
      await markDone(true);
    } catch (e: any) { setErr(e.message); } finally { setUploadPct(null); }
  };

  const ask = async () => {
    try {
      await api('/api/qna', { method: 'POST', json: { courseId: data.course.id, materialId: active.id, content: qText } });
      setQText(''); loadSide(active);
    } catch (e: any) { setErr(e.message); }
  };
  const addNote = async () => {
    const ts = videoRef ? Math.floor(videoRef.currentTime) : 0;
    try {
      await api('/api/notes', { method: 'POST', json: { materialId: active.id, enrollmentId, content: nText, timestampSec: ts } });
      setNText(''); loadSide(active);
    } catch (e: any) { setErr(e.message); }
  };

  if (loadErr) return <div className="card"><p className="err">{loadErr}</p><Link href="/app/courses">← Back to My Courses</Link></div>;
  if (!data) return <p className="muted">Loading…</p>;

  // current lesson with its latest server data (submission status etc.)
  const cur = active ? lessons.find((l) => l.id === active.id) ?? active : null;
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const pct = Number(data.enrollment.progressPct);

  return (<>
    <div className="card">
      <div className="page-head" style={{ marginBottom: 4 }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}><Link href="/app/courses">← My Courses</Link></div>
          <b style={{ fontSize: '1.05rem' }}>{data.course.title}</b>
        </div>
        <span className={`badge ${data.enrollment.status === 'COMPLETED' ? 'green' : 'blue'}`}>
          {data.enrollment.status === 'COMPLETED' ? '✓ Completed' : 'In progress'}
        </span>
      </div>
      <div className="progressbar" style={{ margin: '8px 0' }}><div style={{ width: `${pct}%` }} /></div>
      <span className="muted">{pct}% complete · {doneSet.size} of {lessons.length} lessons</span>
      {data.enrollment.accessExpiry && <span className="muted"> · access until {new Date(data.enrollment.accessExpiry).toLocaleDateString()}</span>}
    </div>

    {lessons.length === 0 && <div className="card"><p className="muted">Lessons for this course will appear here soon.</p></div>}

    <div className="player">
      <div className="card tree">
        {data.course.courseModules.map((cm: any, mi: number) => (
          <div key={cm.moduleId}>
            <div className="sec">Module {mi + 1} · {cm.module.title}</div>
            {cm.module.sections.map((s: any, si: number) => (
              <div key={s.id}>
                <div className="topic">{mi + 1}.{si + 1} {s.title}</div>
                {s.materials.map((m: any) => (
                  <button key={m.id} className={active?.id === m.id ? 'active' : ''} onClick={() => select(m)}>
                    {doneSet.has(m.id) ? <span className="done">✓ </span> : <span className="muted">○ </span>}
                    {TYPE_ICON[m.type] ?? '📎'} {m.title}
                    {m.durationSec ? <span className="muted"> · {fmt(m.durationSec)}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card">
        {!cur && <p className="muted">Select a lesson to begin.</p>}
        {cur && (<>
          <div className="muted" style={{ fontSize: '.78rem' }}>Lesson {cur.num} · {cur.topic}</div>
          <h2 style={{ marginTop: 2 }}>{TYPE_ICON[cur.type]} {cur.title} {doneSet.has(cur.id) && <span className="badge green">✓ done</span>}</h2>
          <div className="tabs">
            {(['content', 'qna', 'notes'] as const).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'content' ? '📖 Lesson' : t === 'qna' ? `💬 Q&A (${qna.length})` : `📝 My Notes (${notes.length})`}
              </button>
            ))}
          </div>
        </>)}
        {err && <div className="err">⚠ {err}</div>}{msg && <div className="ok">{msg}</div>}

        {cur && tab === 'qna' && (<>
          <div className="row">
            <input placeholder="Ask a question about this lesson…" value={qText} onChange={(e) => setQText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && qText.length > 1 && ask()} />
            <button className="btn btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }} disabled={qText.length < 2} onClick={ask}>Ask</button>
          </div>
          {qna.length === 0 && <p className="muted">No questions yet — be the first!</p>}
          {qna.map((q) => (
            <div key={q.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
              <b>{q.user?.name}</b> <span className="muted">· {new Date(q.createdAt).toLocaleDateString()}</span>
              {q.resolvedAt && <span className="badge green" style={{ marginLeft: 6 }}>answered</span>}
              <p style={{ margin: '4px 0' }}>{q.content}</p>
              {q.answers.map((a: any) => (
                <p key={a.id} style={{ margin: '4px 0 4px 18px', padding: '8px 12px', background: 'var(--brand-50)', borderRadius: 10 }}>
                  <b>{a.user?.name}</b> <span className="badge blue">{a.user?.role === 'STUDENT' ? 'learner' : 'instructor'}</span><br />{a.content}
                </p>
              ))}
            </div>
          ))}
        </>)}

        {cur && tab === 'notes' && (<>
          <div className="row">
            <input placeholder={videoRef ? 'Note at the current video time…' : 'Write a note…'} value={nText} onChange={(e) => setNText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && nText && addNote()} />
            <button className="btn btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }} disabled={!nText} onClick={addNote}>Save note</button>
          </div>
          {notes.length === 0 && <p className="muted">No notes for this lesson yet.</p>}
          <div onContextMenu={(e) => e.preventDefault()}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', userSelect: 'none', WebkitUserSelect: 'none' }}>
                {n.timestampSec > 0 && <span className="badge blue" style={{ marginRight: 8, cursor: 'pointer' }}
                  onClick={() => { setTab('content'); setTimeout(() => { if (videoRef) videoRef.currentTime = n.timestampSec; }, 100); }}>▶ {fmt(n.timestampSec)}</span>}
                <span>{n.content}</span>
                <a href="#" className="muted" style={{ float: 'right' }}
                  onClick={async (e) => { e.preventDefault(); await api(`/api/notes/${n.id}`, { method: 'DELETE' }); loadSide(cur); }}>delete</a>
              </div>
            ))}
          </div>
        </>)}

        {/* ── VIDEO ── */}
        {cur && tab === 'content' && cur.type === 'VIDEO' && !streamUrl && !err && <p className="muted">Loading video…</p>}
        {cur && tab === 'content' && cur.type === 'VIDEO' && streamUrl && (<>
          <video
            ref={setVideoRef}
            src={streamUrl}
            controls
            playsInline
            controlsList="nodownload"
            style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: '70vh' }}
            onContextMenu={(e) => e.preventDefault()}
            onPlay={(e) => { lastTimeRef.current = e.currentTarget.currentTime; }}
            onSeeking={() => { lastTimeRef.current = null; }}
            onSeeked={(e) => { lastTimeRef.current = e.currentTarget.currentTime; }}
            onPause={(e) => sendWatch(cur.id, e.currentTarget)}
            onEnded={(e) => sendWatch(cur.id, e.currentTarget)}
            onWaiting={onStall}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = speed;
              let saved = 0;
              try { saved = Number(localStorage.getItem(`pos:${cur.id}`) ?? 0); } catch { /* storage blocked */ }
              if (saved > 5 && saved < v.duration - 10) v.currentTime = saved;
              lastTimeRef.current = null;
              sendWatch(cur.id, v); // load how much of this video was already watched
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              // Count only the seconds that are really played — jumping ahead with the seek bar adds nothing
              const last = lastTimeRef.current;
              if (last !== null && !v.seeking && !v.paused) {
                const dt = v.currentTime - last;
                if (dt > 0 && dt <= 1 + 1.5 * v.playbackRate)
                  for (let sec = Math.floor(last); sec < Math.floor(v.currentTime); sec++) watchedRef.current.add(sec);
              }
              lastTimeRef.current = v.seeking ? null : v.currentTime;
              if (watchedRef.current.size > 0 && Date.now() - lastSentRef.current > 15000) sendWatch(cur.id, v);
              if (Math.floor(v.currentTime) % 5 === 0) {
                try { localStorage.setItem(`pos:${cur.id}`, String(Math.floor(v.currentTime))); } catch { /* ignore */ }
              }
            }}
          />
          <div className="vidbar">
            <span>Quality</span>
            <select value={variantId ?? ''} onChange={(e) => switchQuality(cur.id, e.target.value || null)}>
              {variants.length === 0 && <option value="">Original</option>}
              {variants.map((v) => (
                <option key={v.id ?? 'orig'} value={v.id ?? ''}>{v.label}{v.id ? ` (${v.heightPx}p)` : ''}</option>
              ))}
            </select>
            <span>Speed</span>
            <select value={speed} onChange={(e) => { const sp = Number(e.target.value); setSpeed(sp); if (videoRef) videoRef.playbackRate = sp; }}>
              {[0.75, 1, 1.25, 1.5, 1.75, 2].map((sp) => <option key={sp} value={sp}>{sp}×</option>)}
            </select>
            <span className="muted">▸ Resumes where you left off · marked complete automatically once you have watched 90%</span>
          </div>
          {autoNote && <div className="ok">{autoNote}</div>}
          {!doneSet.has(cur.id) && watch && watch.durationSec > 0 && (
            <div className="muted" style={{ marginTop: 8, fontSize: '.82rem' }}>
              Watched {watch.watchedPct}% of this video · it completes at 90% · skipping ahead does not count
            </div>
          )}
        </>)}

        {/* ── PDF ── */}
        {cur && tab === 'content' && cur.type === 'PDF' && streamUrl && (<>
          {pdfExpanded && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', padding: 16 }}
              onContextMenu={(e) => e.preventDefault()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '.95rem' }}>📄 {cur.title}</span>
                <button className="btn btn-sm" onClick={() => setPdfExpanded(false)} style={{ background: 'rgba(255,255,255,.15)', border: 'none' }}>✕ Close</button>
              </div>
              <iframe src={`${streamUrl}#toolbar=${downloadable ? 1 : 0}&navpanes=0&scrollbar=1&view=FitH`} style={{ flex: 1, width: '100%', border: 0, borderRadius: 10, background: '#2a2a2a' }} />
            </div>
          )}
          <div style={{ position: 'relative' }} onContextMenu={(e) => !downloadable && e.preventDefault()}>
            <iframe src={`${streamUrl}#toolbar=${downloadable ? 1 : 0}&navpanes=0&scrollbar=1&view=FitH`}
              style={{ width: '100%', height: '65vh', border: 0, borderRadius: 10, background: '#f5f5f5' }} />
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setPdfExpanded(true)}>⊞ Full screen</button>
            {downloadable && <a className="btn btn-sm btn-ghost" href={streamUrl} target="_blank">⬇ Download</a>}
            {!doneSet.has(cur.id) && <button className="btn btn-sm" onClick={() => markDone()}>Mark as read</button>}
          </div>
        </>)}

        {/* ── LINK / LIVE ── */}
        {cur && tab === 'content' && (cur.type === 'LINK' || cur.type === 'LIVE') && (<>
          <p className="muted">{cur.type === 'LIVE' ? 'Join the live class using the link below.' : 'This lesson opens an external page in a new tab.'}</p>
          <div className="actions">
            <a className="btn" href={cur.externalUrl} target="_blank" rel="noopener noreferrer">{cur.type === 'LIVE' ? 'Join class ↗' : 'Open link ↗'}</a>
            {!doneSet.has(cur.id) && <button className="btn btn-ghost btn-sm" onClick={() => markDone()}>Mark complete</button>}
          </div>
        </>)}

        {/* ── QUIZ ── */}
        {cur && tab === 'content' && cur.type === 'QUIZ' && !quiz && !quizResult && (
          <div className="panel-inline">
            <p style={{ marginTop: 0 }}>
              {cur.quizInfo?.questions ?? 0} questions
              {cur.quizInfo?.timeLimitMin ? ` · ${cur.quizInfo.timeLimitMin} min time limit` : ' · no time limit'}
              {' '}· {cur.quizInfo?.attemptsAllowed ?? 1} attempt(s) allowed
              {cur.mine ? ` · you used ${cur.mine.attemptsUsed}` : ''}
            </p>
            {cur.mine?.marks != null && <p className="ok">Your last score: <b>{Number(cur.mine.marks)}</b></p>}
            {cur.mine?.status === 'IN_PROGRESS'
              ? <button className="btn" onClick={startQuiz}>Resume quiz</button>
              : (cur.mine?.attemptsUsed ?? 0) >= (cur.quizInfo?.attemptsAllowed ?? 1)
                ? <p className="muted">No attempts left.</p>
                : <button className="btn" onClick={startQuiz}>{cur.mine ? 'Try again' : 'Start quiz'}</button>}
          </div>
        )}
        {cur && tab === 'content' && quiz && (<>
          {left !== null && (
            <div className={`hint ${left < 60 ? 'warn' : ''}`} style={{ position: 'sticky', top: 8, zIndex: 2 }}>
              ⏱ Time left: <b>{fmt(left)}</b> — submit before it runs out
            </div>
          )}
          {quiz.questions.map((q: any, i: number) => (
            <div key={q.id} style={{ marginBottom: 16 }}>
              <p><b>{i + 1}. {q.text}</b></p>
              {q.options.map((opt: string, oi: number) => (
                <p key={oi} style={{ margin: '4px 0' }}><label style={{ fontWeight: 400, fontSize: '.9rem', color: 'var(--text)' }}>
                  <input type="checkbox" style={{ width: 'auto', marginRight: 8 }}
                    checked={(answers[q.id] ?? []).includes(oi)}
                    onChange={(e) => {
                      const c = answers[q.id] ?? [];
                      setAnswers({ ...answers, [q.id]: e.target.checked ? [...c, oi] : c.filter((x) => x !== oi) });
                    }} />
                  {opt}
                </label></p>
              ))}
            </div>
          ))}
          <button className="btn" onClick={submitQuiz}>Submit quiz</button>
        </>)}
        {cur && tab === 'content' && quizResult && (
          <div className="panel-inline">
            <div className="ok" style={{ fontSize: '1.1rem' }}>Score: <b>{Number(quizResult.marks)} / {quizResult.maxMarks}</b></div>
            {quizResult.review && (
              <div style={{ marginTop: 10 }}>
                <b>Correct answers</b>
                {quizResult.review.map((q: any, i: number) => (
                  <p key={q.id} style={{ margin: '6px 0' }}>{i + 1}. {q.text} → <b>{q.correct.map((c: number) => q.options[c]).join(', ')}</b></p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ASSIGNMENT ── */}
        {cur && tab === 'content' && cur.type === 'ASSIGNMENT' && (
          <div className="panel-inline">
            {cur.assignment?.instructions && <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{cur.assignment.instructions}</p>}
            <p className="muted" style={{ fontSize: '.85rem' }}>
              {cur.assignment?.dueAt ? `Due ${new Date(cur.assignment.dueAt).toLocaleString()}` : 'No due date'}
              {cur.assignment?.maxMarks ? ` · out of ${cur.assignment.maxMarks} marks` : ''}
            </p>
            {cur.mine && (
              <p>
                Status: <span className={`badge ${cur.mine.status === 'PUBLISHED' ? 'green' : 'amber'}`}>
                  {cur.mine.status === 'PUBLISHED' ? 'Evaluated' : cur.mine.status === 'PENDING' ? 'Submitted — waiting for evaluation' : 'Being evaluated'}
                </span>
                {cur.mine.marks != null && <> · Marks: <b>{Number(cur.mine.marks)}</b></>}
                {cur.mine.feedback && <><br /><span className="muted">Feedback: {cur.mine.feedback}</span></>}
              </p>
            )}
            {(!cur.mine || cur.mine.status === 'PENDING') && (<>
              <label>{cur.mine ? 'Replace your submission' : 'Upload your work'}</label>
              <input type="file" accept={ACCEPT.assignment} onChange={(e) => setAssignFile(e.target.files?.[0])} />
              {assignFile && <div className="file-pill">📎 {assignFile.name} · {formatBytes(assignFile.size)}</div>}
              {uploadPct !== null && <div className="upload-bar"><div style={{ width: `${uploadPct}%` }} /></div>}
              <button className="btn" onClick={submitAssignment} disabled={!assignFile || uploadPct !== null}>
                {uploadPct !== null ? `Uploading ${uploadPct}%…` : 'Submit assignment'}
              </button>
            </>)}
          </div>
        )}

        {cur && tab === 'content' && (
          <div className="lesson-nav">
            {prev ? <button className="btn btn-ghost btn-sm" onClick={() => select(prev)}>← {prev.title}</button> : <span />}
            {next && <button className="btn btn-sm" onClick={() => select(next)}>Next: {next.title} →</button>}
          </div>
        )}
      </div>
    </div>
  </>);
}
