'use client';

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

export default function QuizBuilder({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const q = value ?? defaultQuiz();
  const set = (patch: any) => onChange({ ...q, ...patch });
  const setQ = (i: number, patch: Partial<QQ>) =>
    set({ questions: q.questions.map((x: QQ, xi: number) => (xi === i ? { ...x, ...patch } : x)) });
  return (
    <div className="panel-inline">
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
