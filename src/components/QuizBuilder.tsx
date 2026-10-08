'use client';
import { useRef, useState } from 'react';
import { readQuizFile, downloadQuizTemplate, QUIZ_IMPORT_ACCEPT, type QuizImportResult } from '@/lib/client/quizImport';

export interface QQ { text: string; options: string[]; correct: number[]; marks: number; negative: number; }
export const newQ = (): QQ => ({ text: '', options: ['', ''], correct: [], marks: 1, negative: 0 });
export const defaultQuiz = () => ({ timeLimitMin: 10, attemptsAllowed: 1, showAnswers: true, questions: [newQ()] });

/** Validate + convert the editor state into the API's quizSchema. Throws a friendly message. */
export function toQuizSchema(q: any) {
  const quiz = q ?? defaultQuiz();
  const questions = (quiz.questions ?? [])
    .filter((x: QQ) => x.text.trim())
    .map((x: QQ, i: number) => {
      const opts = x.options.map((o) => o.trim());
      if (opts.filter(Boolean).length < 2) throw new Error(`Question ${i + 1}: add at least 2 options`);
      if (!x.correct.length) throw new Error(`Question ${i + 1}: tick the correct answer(s)`);
      // drop empty options and re-map the correct indexes
      const keep = opts.map((o, oi) => ({ o, oi })).filter((z) => z.o);
      return {
        id: `q${i + 1}`,
        text: x.text.trim(),
        options: keep.map((z) => z.o),
        correct: x.correct.map((c) => keep.findIndex((z) => z.oi === c)).filter((c) => c >= 0),
        marks: x.marks || 1,
        negative: x.negative || 0,
      };
    });
  if (!questions.length) throw new Error('Add at least one question');
  return {
    timeLimitMin: quiz.timeLimitMin || undefined,
    attemptsAllowed: quiz.attemptsAllowed || 1,
    shuffle: true,
    showAnswers: quiz.showAnswers ?? true,
    questions,
  };
}

const hasContent = (x: QQ) => !!(x.text.trim() || x.options.some((o) => o.trim()));
const round2 = (n: number) => Math.round(n * 100) / 100;

interface ImportState {
  busy?: boolean;
  fileName?: string;
  errors?: string[];
  warnings?: string[];
  ok?: string;
  details?: string;
  pending?: QuizImportResult; // waiting for "replace" / "add after"
  existing?: number;
}

export default function QuizBuilder({ value, onChange, onImported }: {
  value: any;
  onChange: (v: any) => void;
  /** called after an Excel/CSV import — `title` is the sheet's quiz_title (if it had one) */
  onImported?: (info: { title?: string; fileName: string }) => void;
}) {
  const q = value ?? defaultQuiz();
  const set = (patch: any) => onChange({ ...q, ...patch });
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ImportState>({});
  const [drag, setDrag] = useState(false);
  // file reading is async — always apply to the latest quiz, not the one from when the file was picked
  const latest = useRef({ q, onChange, onImported });
  latest.current = { q, onChange, onImported };

  const apply = (res: QuizImportResult, mode: 'replace' | 'append', fileName: string) => {
    const { q: cur, onChange: change, onImported: imported } = latest.current;
    const kept: QQ[] = mode === 'append' ? cur.questions.filter(hasContent) : [];
    const s = res.settings;
    change({
      ...cur,
      ...(s.timeLimitMin !== undefined ? { timeLimitMin: s.timeLimitMin } : {}),
      ...(s.attemptsAllowed !== undefined ? { attemptsAllowed: s.attemptsAllowed } : {}),
      ...(s.showAnswers !== undefined ? { showAnswers: s.showAnswers } : {}),
      questions: [...kept, ...res.questions],
    });
    imported?.({ title: s.title, fileName });

    const n = res.questions.length;
    const marks = round2(res.questions.reduce((t, x) => t + x.marks, 0));
    const info = [
      s.title && `title “${s.title}”`,
      s.timeLimitMin !== undefined && (s.timeLimitMin ? `${s.timeLimitMin} min time limit` : 'no time limit'),
      s.attemptsAllowed !== undefined && `${s.attemptsAllowed} attempt${s.attemptsAllowed === 1 ? '' : 's'}`,
      s.showAnswers !== undefined && (s.showAnswers ? 'answers shown after submit' : 'answers hidden after submit'),
    ].filter(Boolean).join(' · ');
    // adding the same sheet twice by mistake → point out the repeats
    const already = new Set(kept.map((x) => x.text.trim().toLowerCase()));
    const repeats = res.questions
      .map((x, i) => (already.has(x.text.trim().toLowerCase()) ? `Q${kept.length + i + 1} “${x.text}” is already in this quiz.` : ''))
      .filter(Boolean);
    setImp({
      fileName,
      ok: `✓ ${mode === 'append' ? `Added ${n} more` : `Imported ${n}`} question${n === 1 ? '' : 's'} (${marks} marks) from ${fileName}` +
        (mode === 'append' ? ` — ${kept.length + n} questions in total.` : '.'),
      details: info ? `Settings from the file: ${info}.` : undefined,
      warnings: [...repeats, ...res.warnings],
    });
  };

  const importFile = async (file: File) => {
    setImp({ busy: true, fileName: file.name });
    try {
      const res = await readQuizFile(file);
      if (res.errors.length) { setImp({ fileName: file.name, errors: res.errors }); return; }
      const existing = latest.current.q.questions.filter(hasContent).length;
      if (existing) setImp({ fileName: file.name, pending: res, existing });
      else apply(res, 'replace', file.name);
    } catch (e: any) {
      setImp({ fileName: file.name, errors: [e?.message || 'Could not read this file.'] });
    }
  };

  const importBox = (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !imp.busy) importFile(f); }}
      style={{ border: `1.5px dashed ${drag ? 'var(--brand)' : 'var(--border-strong)'}`, background: drag ? 'var(--brand-50)' : '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', fontSize: '.84rem' }}>
          <b>📥 Add all questions from Excel</b>
          <div className="muted" style={{ fontSize: '.78rem' }}>
            Download the sample, write one question per row with its options, put the correct letter (A, or A,C for more than one) and marks — then upload it here or drop the file on this box.
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadQuizTemplate('xlsx')}>⬇ Sample Excel</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadQuizTemplate('csv')}>⬇ Sample CSV</button>
        <button type="button" className="btn btn-sm" disabled={imp.busy} onClick={() => fileRef.current?.click()}>
          {imp.busy ? 'Reading file…' : '⬆ Upload Excel / CSV'}
        </button>
        <input ref={fileRef} type="file" accept={QUIZ_IMPORT_ACCEPT} style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
      </div>

      {imp.errors && (
        <div className="hint warn" style={{ margin: '10px 0 0' }}>
          <b>Nothing was imported from {imp.fileName}.</b> Fix {imp.errors.length === 1 ? 'this' : `these ${imp.errors.length} problems`} in the file, save it and upload again:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {imp.errors.slice(0, 15).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          {imp.errors.length > 15 && <div style={{ marginTop: 4 }}>…and {imp.errors.length - 15} more.</div>}
        </div>
      )}

      {imp.pending && (
        <div className="hint" style={{ margin: '10px 0 0' }}>
          Found <b>{imp.pending.questions.length} question{imp.pending.questions.length === 1 ? '' : 's'}</b> in {imp.fileName}.
          You already have {imp.existing} question{imp.existing === 1 ? '' : 's'} below — what should happen to {imp.existing === 1 ? 'it' : 'them'}?
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => apply(imp.pending!, 'replace', imp.fileName!)}>Replace with the file</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => apply(imp.pending!, 'append', imp.fileName!)}>Keep them and add the file’s questions after</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImp({})}>Cancel</button>
          </div>
        </div>
      )}

      {imp.ok && (
        <div className="ok" style={{ margin: '10px 0 0' }}>
          {imp.ok} Check them below, then save the lesson.
          {imp.details && <div className="muted" style={{ marginTop: 2 }}>{imp.details}</div>}
        </div>
      )}
      {!!imp.warnings?.length && (
        <div className="hint warn" style={{ margin: '8px 0 0' }}>
          Imported, but please double-check:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {imp.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          {imp.warnings.length > 10 && <div style={{ marginTop: 4 }}>…and {imp.warnings.length - 10} more.</div>}
        </div>
      )}
    </div>
  );

  const setQ = (i: number, patch: Partial<QQ>) =>
    set({ questions: q.questions.map((x: QQ, xi: number) => (xi === i ? { ...x, ...patch } : x)) });
  return (
    <div className="panel-inline">
      {importBox}
      <div className="row">
        <div><label>Time limit (minutes, 0 = none)</label><input type="number" min={0} value={q.timeLimitMin} onChange={(e) => set({ timeLimitMin: Number(e.target.value) })} /></div>
        <div><label>Attempts allowed</label><input type="number" min={1} value={q.attemptsAllowed} onChange={(e) => set({ attemptsAllowed: Number(e.target.value) })} /></div>
        <div><label>Show correct answers after submit</label><select value={q.showAnswers ? 'y' : 'n'} onChange={(e) => set({ showAnswers: e.target.value === 'y' })}><option value="y">Yes</option><option value="n">No</option></select></div>
      </div>
      {q.questions.map((qq: QQ, i: number) => (
        <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <b style={{ flex: '0 0 auto' }}>Q{i + 1}</b>
            <input placeholder="Type the question" value={qq.text} onChange={(e) => setQ(i, { text: e.target.value })} />
            {q.questions.length > 1 && (
              <button className="iconbtn" style={{ flex: '0 0 auto' }} title="Remove question"
                onClick={() => set({ questions: q.questions.filter((_: QQ, xi: number) => xi !== i) })}>✕</button>
            )}
          </div>
          {qq.options.map((opt, oi) => (
            <div className="row" key={oi} style={{ alignItems: 'center' }}>
              <label style={{ flex: '0 0 auto', fontWeight: 400, minWidth: 90 }}>
                <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={qq.correct.includes(oi)}
                  onChange={(e) => setQ(i, { correct: e.target.checked ? [...qq.correct, oi] : qq.correct.filter((c) => c !== oi) })} />
                correct
              </label>
              <input placeholder={`Option ${oi + 1}`} value={opt}
                onChange={(e) => setQ(i, { options: qq.options.map((o, xo) => (xo === oi ? e.target.value : o)) })} />
              {qq.options.length > 2 && (
                <button className="iconbtn" style={{ flex: '0 0 auto' }}
                  onClick={() => setQ(i, { options: qq.options.filter((_, xo) => xo !== oi), correct: qq.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)) })}>✕</button>
              )}
            </div>
          ))}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', marginBottom: 12 }} onClick={() => setQ(i, { options: [...qq.options, ''] })}>+ Option</button>
            <div><label>Marks</label><input type="number" min={0} value={qq.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} /></div>
            <div><label>Negative marks</label><input type="number" min={0} step="0.25" value={qq.negative} onChange={(e) => setQ(i, { negative: Number(e.target.value) })} /></div>
          </div>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => set({ questions: [...q.questions, newQ()] })}>+ Add question</button>
    </div>
  );
}
