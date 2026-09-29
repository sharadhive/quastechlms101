'use client';
import { useState } from 'react';
import { api, uploadFile, ACCEPT } from '@/lib/client/api';
import { formatBytes } from '@/lib/utils/files';
import QuizBuilder, { defaultQuiz, toQuizSchema } from './QuizBuilder';

const TYPES = [
  { key: 'VIDEO', label: '🎬 Video' },
  { key: 'PDF', label: '📄 PDF / Notes' },
  { key: 'QUIZ', label: '❓ Quiz' },
  { key: 'ASSIGNMENT', label: '📝 Assignment' },
  { key: 'LINK', label: '🔗 Link' },
  { key: 'LIVE', label: '📡 Live class link' },
] as const;
type LessonType = (typeof TYPES)[number]['key'];

const HELP: Record<LessonType, string> = {
  VIDEO: 'Upload an MP4 (best), MOV, WebM or MKV. Large files are sent in small parts and resume automatically if the internet drops.',
  PDF: 'Upload notes, slides or a handout as PDF. Students read it inside the player.',
  QUIZ: 'Multiple-choice questions, marked automatically. Tick every correct option.',
  ASSIGNMENT: 'Students upload a file (PDF, Word, zip, image…). You mark it in the Evaluation queue.',
  LINK: 'Any web page — documentation, GitHub repo, article, YouTube video.',
  LIVE: 'Zoom / Google Meet link for a live class inside this topic.',
};

/** Read the duration of a local video file (seconds) without uploading it. */
function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : undefined); };
      v.onerror = () => resolve(undefined);
      v.src = URL.createObjectURL(file);
      setTimeout(() => resolve(undefined), 8000);
    } catch { resolve(undefined); }
  });
}

const titleFromFile = (name: string) =>
  name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** "Add lesson" form used inside a topic of the course builder. */
export default function AddLesson({ sectionId, label, onAdded, onCancel }: {
  sectionId: string; label: string; onAdded: (msg: string) => void; onCancel: () => void;
}) {
  const [type, setType] = useState<LessonType>('VIDEO');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [downloadable, setDownloadable] = useState(false);
  const [url, setUrl] = useState('');
  const [quiz, setQuiz] = useState<any>(defaultQuiz());
  const [assign, setAssign] = useState({ instructions: '', dueAt: '', maxMarks: '' });
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const needsFile = type === 'VIDEO' || type === 'PDF';
  const busy = progress !== null;
  const canSave = !!title.trim() && (!needsFile || !!file) && ((type !== 'LINK' && type !== 'LIVE') || /^https?:\/\//.test(url));

  const pick = (f: File | null) => {
    setFile(f); setErr('');
    if (f && !title.trim()) setTitle(titleFromFile(f.name));
  };

  const save = async () => {
    setErr('');
    try {
      const json: any = { type, title: title.trim() };
      if (type === 'QUIZ') json.quizSchema = toQuizSchema(quiz);
      if (type === 'LINK' || type === 'LIVE') json.externalUrl = url.trim();
      if (type === 'ASSIGNMENT')
        json.assignment = {
          instructions: assign.instructions || undefined,
          dueAt: assign.dueAt ? new Date(assign.dueAt).toISOString() : undefined,
          maxMarks: assign.maxMarks ? Number(assign.maxMarks) : undefined,
        };
      if (needsFile && file) {
        setProgress(0);
        if (type === 'VIDEO') json.durationSec = await probeDuration(file);
        json.fileKey = await uploadFile(file, 'material', setProgress);
        json.sizeBytes = file.size;
        json.isDownloadable = type === 'PDF' ? downloadable : false;
      }
      await api(`/api/sections/${sectionId}/materials`, { method: 'POST', json });
      onAdded(`“${json.title}” added ✓`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="panel-inline">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>➕ New lesson {label}</b>
        <button className="iconbtn" title="Close" onClick={onCancel} disabled={busy}>✕</button>
      </div>
      <div className="type-chips">
        {TYPES.map((t) => (
          <button key={t.key} className={type === t.key ? 'active' : ''} disabled={busy}
            onClick={() => { setType(t.key); setFile(null); setErr(''); }}>{t.label}</button>
        ))}
      </div>
      <div className="hint">{HELP[type]}</div>

      {needsFile && (<>
        <label>{type === 'VIDEO' ? 'Video file' : 'PDF file'}</label>
        <input type="file" accept={type === 'VIDEO' ? ACCEPT.video : ACCEPT.pdf} disabled={busy}
          onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        {file && <div className="file-pill">📎 {file.name} · {formatBytes(file.size)}</div>}
        {type === 'PDF' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} />
            Allow students to download this PDF
          </label>
        )}
      </>)}

      <label>Lesson title</label>
      <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)}
        placeholder={type === 'QUIZ' ? 'e.g. HTML basics — quick test' : type === 'ASSIGNMENT' ? 'e.g. Build a landing page' : 'e.g. Introduction to HTML'} />

      {(type === 'LINK' || type === 'LIVE') && (<>
        <label>{type === 'LIVE' ? 'Meeting link' : 'URL'}</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </>)}

      {type === 'QUIZ' && <QuizBuilder value={quiz} onChange={setQuiz} />}

      {type === 'ASSIGNMENT' && (<>
        <label>Instructions for students</label>
        <textarea rows={4} value={assign.instructions} onChange={(e) => setAssign({ ...assign, instructions: e.target.value })}
          placeholder="What should they build/write, and what should the uploaded file contain?" />
        <div className="row">
          <div><label>Due date (optional)</label><input type="datetime-local" value={assign.dueAt} onChange={(e) => setAssign({ ...assign, dueAt: e.target.value })} /></div>
          <div><label>Maximum marks (optional)</label><input type="number" min={1} value={assign.maxMarks} onChange={(e) => setAssign({ ...assign, maxMarks: e.target.value })} /></div>
        </div>
      </>)}

      {busy && (<>
        <div className="upload-bar"><div style={{ width: `${progress}%` }} /></div>
        <div className="muted" style={{ fontSize: '.8rem' }}>Uploading {progress}% — keep this tab open. If the connection drops it resumes automatically.</div>
      </>)}
      {err && <div className="err">{err}</div>}
      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn" onClick={save} disabled={!canSave || busy}>{busy ? `Uploading ${progress}%…` : 'Save lesson'}</button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
