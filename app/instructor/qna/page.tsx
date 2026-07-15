'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';

export default function InstructorQnA() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const load = () => api('/api/qna?unanswered').then((d) => setRows(d.questions));
  useEffect(() => { load(); }, []);
  const answer = async (q: any) => {
    await api('/api/qna', { method: 'POST', json: { courseId: q.courseId, parentId: q.id, content: reply[q.id] } });
    setReply({ ...reply, [q.id]: '' }); load();
  };
  return (
    <div className="card">
      <h2>❓ Unanswered questions from your courses</h2>
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="🎉" text="All questions answered!" /> : rows.map((q) => (
        <div key={q.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
          <b>{q.user?.name}</b> <span className="muted">asked · {new Date(q.createdAt).toLocaleString()}</span>
          <p style={{ margin: '6px 0' }}>{q.content}</p>
          <div className="row">
            <input placeholder="Write your answer…" value={reply[q.id] ?? ''}
              onChange={(e) => setReply({ ...reply, [q.id]: e.target.value })} />
            <button className="btn btn-sm" style={{ flex: '0 0 auto' }} disabled={!reply[q.id]} onClick={() => answer(q)}>Answer</button>
          </div>
        </div>
      ))}
    </div>
  );
}
