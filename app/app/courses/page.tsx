'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';

export default function MyCourses() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL'); // ALL | ACTIVE | COMPLETED
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api('/api/me/courses').then((d) => setRows(d.enrollments ?? [])).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'ALL' ? rows : rows.filter((e) => e.status === filter);

  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
      <h1>📚 My Courses</h1>
      <div className="filter-chips">
        {['ALL', 'ACTIVE', 'COMPLETED'].map((s) => (
          <button key={s} className={`filter-chip${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'ALL' ? 'All' : s === 'ACTIVE' ? '🟢 Active' : '✅ Completed'}
          </button>
        ))}
      </div>
    </div>

    {loading ? (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div className="muted">Loading your courses…</div>
      </div>
    ) : filtered.length === 0 ? (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
        <p className="muted">
          {filter !== 'ALL' ? `No ${filter.toLowerCase()} courses.` : 'You haven\'t enrolled in any courses yet.'}
        </p>
        <Link href="/app/explore" className="btn" style={{ marginTop: 8 }}>Explore Courses →</Link>
      </div>
    ) : (
      <div className="grid grid-4">
        {filtered.map((e) => (
          <Link key={e.id} href={`/app/courses/${e.id}`}>
            <div className="card" style={{ marginBottom: 0, position: 'relative' }}>
              {/* Self-purchased indicator */}
              {e.assignedById === e.learnerId && (
                <span style={{ position: 'absolute', top: 8, right: 8, fontSize: '.65rem', fontWeight: 700,
                  background: 'var(--brand-50)', color: 'var(--brand)', padding: '2px 8px', borderRadius: 99 }}>
                  Self-enrolled
                </span>
              )}
              <b>{e.course?.title ?? 'Course'}</b>
              {e.batch && <p className="muted">{e.batch.name}</p>}
              {!e.batch && <p className="muted" style={{ fontStyle: 'italic' }}>Self-paced</p>}
              <div className="progressbar" style={{ margin: '10px 0 6px' }}>
                <div style={{ width: `${e.progressPct}%` }} />
              </div>
              <p className="muted">
                {Math.round(Number(e.progressPct))}% complete ·{' '}
                <span className={`badge ${e.status === 'COMPLETED' ? 'green' : e.status === 'ACTIVE' ? 'blue' : 'gray'}`}>
                  {e.status}
                </span>
              </p>
              {e.status === 'COMPLETED' && (
                <div onClick={(ev) => ev.preventDefault()} style={{ marginTop: 6 }}>
                  <span className="muted">Rate: </span>
                  {[1,2,3,4,5].map((r) => (
                    <span key={r} style={{ cursor: 'pointer', fontSize: '1.1rem' }}
                      onClick={async () => {
                        await api('/api/reviews', { method: 'POST', json: { courseId: e.course?.id ?? e.courseId, rating: r } });
                        alert('Thanks for rating ' + r + '★');
                      }}>⭐</span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    )}
  </>);
}
