'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { SkelRows, Empty } from '@/components/ui';

export default function InstructorNotes() {
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [filterStudent, setFilterStudent] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');

  // Load instructor's batches
  useEffect(() => {
    api('/api/batches').then((d) => {
      setBatches(d.batches ?? []);
      if (d.batches?.length > 0) setBatchId(d.batches[0].id);
    });
  }, []);

  // Load notes when batch changes
  useEffect(() => {
    if (!batchId) return;
    setLoading(true); setData(null);
    api(`/api/notes/batch?batchId=${batchId}`)
      .then(setData)
      .catch(() => setData({ batch: null, notes: [] }))
      .finally(() => setLoading(false));
  }, [batchId]);

  // Unique students and materials for filters
  const students = [...new Set((data?.notes ?? []).map((n: any) => n.studentName))].sort();
  const materials = [...new Set((data?.notes ?? []).map((n: any) => n.materialTitle))].sort();

  // Filtered notes
  const filtered = (data?.notes ?? []).filter((n: any) => {
    if (filterStudent && n.studentName !== filterStudent) return false;
    if (filterMaterial && n.materialTitle !== filterMaterial) return false;
    return true;
  });

  // Group by material
  const grouped = new Map<string, any[]>();
  for (const n of filtered) {
    const key = n.materialTitle;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(n);
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (<>
    {/* Header */}
    <div className="card" style={{ background: 'linear-gradient(135deg, #312E81 0%, #1E293B 100%)', color: '#fff', border: 'none' }}>
      <h2 style={{ marginTop: 0, color: '#fff', fontSize: '1.2rem' }}>📝 Student Notes</h2>
      <p style={{ color: '#94a3b8', margin: 0, fontSize: '.88rem' }}>
        View notes taken by students in your batches — read-only access
      </p>
    </div>

    {/* Batch selector + filters */}
    <div className="card">
      <div className="filterbar">
        <div>
          <label>Select Batch</label>
          <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setFilterStudent(''); setFilterMaterial(''); }}>
            {batches.length === 0 && <option value="">No batches assigned</option>}
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} — {b.course.title}</option>
            ))}
          </select>
        </div>
        {data && data.notes.length > 0 && (<>
          <div>
            <label>Filter by Student</label>
            <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)}>
              <option value="">All Students ({students.length})</option>
              {students.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>Filter by Lesson</label>
            <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)}>
              <option value="">All Lessons ({materials.length})</option>
              {materials.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </>)}
      </div>
      {data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="badge blue">📚 {data.batch?.course ?? '—'}</span>
          <span className="badge gray">📝 {filtered.length} notes</span>
          <span className="badge gray">👨‍🎓 {students.length} students</span>
        </div>
      )}
    </div>

    {/* Notes list */}
    {loading && <div className="card"><SkelRows /></div>}

    {data && filtered.length === 0 && !loading && (
      <div className="card">
        <Empty icon="📝" text={data.notes.length === 0
          ? 'No notes taken by students in this batch yet.'
          : 'No notes match your filters.'
        } />
      </div>
    )}

    {[...grouped.entries()].map(([materialTitle, notes]) => (
      <div className="card" key={materialTitle}>
        <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1rem' }}>📖</span> {materialTitle}
          <span className="badge gray" style={{ fontWeight: 400 }}>{notes.length} notes</span>
        </h2>
        {notes.map((n: any) => {
          const isExpanded = expandedNote === n.id;
          return (
            <div key={n.id} style={{
              padding: '12px 14px', marginBottom: 8,
              border: '1px solid var(--border)', borderRadius: 10,
              background: isExpanded ? 'var(--brand-50)' : '#fafbfe',
              transition: 'all .15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: '.7rem' }}>
                    {n.studentName.charAt(0).toUpperCase()}
                  </div>
                  <b style={{ fontSize: '.86rem' }}>{n.studentName}</b>
                  {n.timestampSec > 0 && (
                    <span className="badge blue" style={{ fontSize: '.65rem' }}>▶ {fmt(n.timestampSec)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: '.72rem' }}>
                    {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  <button className="iconbtn" title={isExpanded ? 'Collapse' : 'Enlarge'}
                    onClick={() => setExpandedNote(isExpanded ? null : n.id)}
                    style={{ fontSize: '.75rem' }}>
                    {isExpanded ? '⊟' : '⊞'}
                  </button>
                </div>
              </div>
              <div style={{
                fontSize: '.86rem', lineHeight: 1.5, color: 'var(--text)',
                whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
                overflow: isExpanded ? 'visible' : 'hidden',
                textOverflow: isExpanded ? 'unset' : 'ellipsis',
                maxHeight: isExpanded ? 'none' : '1.5em',
                userSelect: 'none', WebkitUserSelect: 'none',
              }}>
                {n.content}
              </div>
            </div>
          );
        })}
      </div>
    ))}
  </>);
}
