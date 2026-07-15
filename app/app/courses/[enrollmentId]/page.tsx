'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, uploadFile } from '@/lib/client/api';

export default function Player() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const [data, setData] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [quiz, setQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [quizResult, setQuizResult] = useState<any>(null);
  const [assignFile, setAssignFile] = useState<File | undefined>();
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

  const load = () => api(`/api/me/courses/${enrollmentId}`).then(setData);
  useEffect(() => { load(); }, [enrollmentId]);
  const doneSet = new Set((data?.completed ?? []).map((c: any) => c.materialId));

  const loadSide = (m: any) => {
    api(`/api/qna?courseId=${data.course.id}&materialId=${m.id}`).then((d) => setQna(d.questions)).catch(() => {});
    api(`/api/notes?materialId=${m.id}`).then((d) => setNotes(d.notes)).catch(() => {});
  };
  const select = async (m: any) => {
    setActive(m); setStreamUrl(''); setQuiz(null); setQuizResult(null); setMsg(''); setErr(''); setTab('content');
    loadSide(m);
    if (m.type === 'VIDEO' || m.type === 'PDF') {
      try {
        const d = await api(`/api/materials/${m.id}/stream-url`);
        setStreamUrl(d.url);
        setVariants(d.variants ?? []);
        setVariantId(null);
        setStalls(0); setAutoNote('');
        // Auto-quality: on a slow connection start with the lowest available version
        const conn: any = (navigator as any).connection;
        const slow = conn && (conn.saveData || ['slow-2g', '2g', '3g'].includes(conn.effectiveType));
        const lowest = (d.variants ?? []).filter((v: any) => v.id).sort((a: any, b: any) => a.heightPx - b.heightPx)[0];
        if (slow && lowest) {
          setAutoNote(`Slow connection detected — playing ${lowest.label}`);
          switchQuality(m.id, lowest.id);
        }
      } catch (e: any) { setErr(e.message); }
    }
  };

  /** Switch video quality WITHOUT losing the current position. */
  const switchQuality = async (materialId: string, vId: string | null) => {
    const at = videoRef?.currentTime ?? 0;
    const playing = videoRef ? !videoRef.paused : false;
    const d = await api(`/api/materials/${materialId}/stream-url${vId ? `?variantId=${vId}` : ''}`);
    setVariantId(vId);
    setStreamUrl(d.url);
    setTimeout(() => {
      if (videoRef) {
        videoRef.currentTime = at;
        videoRef.playbackRate = speed;
        if (playing) videoRef.play().catch(() => {});
      }
    }, 60);
  };

  /** Repeated buffering → step down one quality level automatically. */
  const onStall = () => {
    const next = stalls + 1;
    setStalls(next);
    if (next < 3) return;
    const lower = variants
      .filter((v) => v.id && (!variantId || v.heightPx < (variants.find((x) => x.id === variantId)?.heightPx ?? 9999)))
      .sort((a, b) => b.heightPx - a.heightPx)[0];
    if (lower) {
      setAutoNote(`Buffering — switched to ${lower.label} for smoother playback`);
      setStalls(0);
      switchQuality(active.id, lower.id);
    }
  };
  const markDone = async () => {
    await api('/api/progress', { method: 'POST', json: { enrollmentId, materialId: active.id } });
    setMsg('Marked complete ✓'); load();
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
      setQuizResult(r); setQuiz(null); await markDone();
    } catch (e: any) { setErr(e.message); }
  };
  const submitAssignment = async () => {
    setErr('');
    try {
      const key = await uploadFile(assignFile!, 'assignment');
      const r = await api(`/api/assignments/${active.id}/submit`, { method: 'POST', json: { fileKey: key } });
      setMsg(`Submitted${r.isLate ? ' (late)' : ''} — awaiting evaluation.`); await markDone();
    } catch (e: any) { setErr(e.message); }
  };

  const ask = async () => {
    await api('/api/qna', { method: 'POST', json: { courseId: data.course.id, materialId: active.id, content: qText } });
    setQText(''); loadSide(active);
  };
  const addNote = async () => {
    const ts = videoRef ? Math.floor(videoRef.currentTime) : 0;
    await api('/api/notes', { method: 'POST', json: { materialId: active.id, enrollmentId, content: nText, timestampSec: ts } });
    setNText(''); loadSide(active);
  };
  const fmt = (s2: number) => `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`;

  if (!data) return <p className="muted">Loading…</p>;
  return (<>
    <div className="card">
      <b>{data.course.title}</b>
      <div className="progressbar" style={{ margin: '8px 0' }}><div style={{ width: `${data.enrollment.progressPct}%` }} /></div>
      <span className="muted">{data.enrollment.progressPct}% complete</span>
    </div>
    <div className="player">
      <div className="card tree">
        {data.course.courseModules.map((cm: any) => (
          <div key={cm.moduleId}>
            <div className="sec">{cm.module.title}</div>
            {cm.module.sections.map((s: any) => s.materials.map((m: any) => (
              <button key={m.id} className={active?.id === m.id ? 'active' : ''} onClick={() => select(m)}>
                {doneSet.has(m.id) ? <span className="done">✓ </span> : '○ '}{m.title}
                <span className="muted"> · {m.type.toLowerCase()}</span>
              </button>
            )))}
          </div>
        ))}
      </div>
      <div className="card">
        {!active && <p className="muted">Select a lesson to begin.</p>}
        {active && <h2 style={{ marginTop: 0 }}>{active.title}</h2>}
        {active && (
          <div className="filterbar" style={{ marginBottom: 12 }}>
            {(['content', 'qna', 'notes'] as const).map((t) => (
              <button key={t} className={tab === t ? 'btn btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setTab(t)}>
                {t === 'content' ? '📖 Lesson' : t === 'qna' ? `💬 Q&A (${qna.length})` : `📝 My Notes (${notes.length})`}
              </button>
            ))}
          </div>
        )}
        {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
        {active && tab === 'qna' && (<>
          <div className="row">
            <input placeholder="Ask a question about this lesson…" value={qText} onChange={(e) => setQText(e.target.value)} />
            <button className="btn btn-sm" style={{ flex: '0 0 auto' }} disabled={!qText} onClick={ask}>Ask</button>
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
        {active && tab === 'notes' && (<>
          <div className="row">
            <input placeholder={videoRef ? 'Note at current video time…' : 'Write a note…'} value={nText} onChange={(e) => setNText(e.target.value)} />
            <button className="btn btn-sm" style={{ flex: '0 0 auto' }} disabled={!nText} onClick={addNote}>Save note</button>
          </div>
          {notes.length === 0 && <p className="muted">No notes for this lesson yet.</p>}
          {notes.map((n) => (
            <p key={n.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
              {n.timestampSec > 0 && <span className="badge blue" style={{ marginRight: 8, cursor: 'pointer' }}
                onClick={() => { if (videoRef) videoRef.currentTime = n.timestampSec; }}>▶ {fmt(n.timestampSec)}</span>}
              {n.content}
              <a href="#" className="muted" style={{ float: 'right' }}
                onClick={async (e) => { e.preventDefault(); await api(`/api/notes/${n.id}`, { method: 'DELETE' }); loadSide(active); }}>delete</a>
            </p>
          ))}
        </>)}
        {tab !== 'content' ? null : <></>}
        {tab === 'content' && active?.type === 'VIDEO' && streamUrl && (<>
          <video
            ref={setVideoRef}
            src={streamUrl}
            controls
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onEnded={markDone}
            onWaiting={onStall}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = speed;
              const saved = Number(localStorage.getItem(`pos:${active.id}`) ?? 0);
              if (saved > 5 && saved < v.duration - 10) v.currentTime = saved;
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (Math.floor(v.currentTime) % 5 === 0) localStorage.setItem(`pos:${active.id}`, String(Math.floor(v.currentTime)));
            }}
          />
          <div className="vidbar">
            <span>Quality</span>
            <select value={variantId ?? ''} onChange={(e) => switchQuality(active.id, e.target.value || null)}>
              {variants.length === 0 && <option value="">Original</option>}
              {variants.map((v) => (
                <option key={v.id ?? 'orig'} value={v.id ?? ''}>{v.label}{v.id ? ` (${v.heightPx}p)` : ''}</option>
              ))}
            </select>
            <span>Speed</span>
            <select value={speed} onChange={(e) => { const sp = Number(e.target.value); setSpeed(sp); if (videoRef) videoRef.playbackRate = sp; }}>
              {[0.75, 1, 1.25, 1.5, 1.75, 2].map((sp) => <option key={sp} value={sp}>{sp}×</option>)}
            </select>
            <span className="muted">▸ Resumes where you left off · progress saves when the video ends</span>
          </div>
          {autoNote && <div className="ok">{autoNote}</div>}
        </>)}
        {tab === 'content' && active?.type === 'PDF' && streamUrl && (<>
          <iframe src={streamUrl} style={{ width: '100%', height: '65vh', border: 0, borderRadius: 10 }} />
          <button className="btn btn-sm" onClick={markDone}>Mark as read</button>
        </>)}
        {tab === 'content' && active?.type === 'LINK' && (<>
          <a className="btn" href={active.externalUrl} target="_blank">Open link ↗</a>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={markDone}>Mark complete</button>
        </>)}
        {tab === 'content' && active?.type === 'QUIZ' && !quiz && !quizResult && (
          <button className="btn" onClick={startQuiz}>Start quiz</button>
        )}
        {tab === 'content' && quiz && (<>
          {quiz.timeLimitMin && <p className="muted">⏱ Time limit: {quiz.timeLimitMin} min (enforced server-side)</p>}
          {quiz.questions.map((q: any, i: number) => (
            <div key={q.id} style={{ marginBottom: 16 }}>
              <p><b>{i + 1}. {q.text}</b></p>
              {q.options.map((opt: string, oi: number) => (
                <p key={oi}><label style={{ fontWeight: 400 }}>
                  <input type="checkbox" style={{ width: 'auto', marginRight: 8 }}
                    checked={(answers[q.id] ?? []).includes(oi)}
                    onChange={(e) => {
                      const cur = answers[q.id] ?? [];
                      setAnswers({ ...answers, [q.id]: e.target.checked ? [...cur, oi] : cur.filter((x) => x !== oi) });
                    }} />
                  {opt}
                </label></p>
              ))}
            </div>
          ))}
          <button className="btn" onClick={submitQuiz}>Submit quiz</button>
        </>)}
        {tab === 'content' && quizResult && <div className="ok" style={{ fontSize: '1.1rem' }}>Score: <b>{quizResult.marks} / {quizResult.maxMarks}</b></div>}
        {tab === 'content' && active?.type === 'ASSIGNMENT' && (<>
          <input type="file" onChange={(e) => setAssignFile(e.target.files?.[0])} />
          <button className="btn" onClick={submitAssignment} disabled={!assignFile}>Submit assignment</button>
        </>)}
      </div>
    </div>
  </>);
}
