'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { SkelRows, Empty } from '@/components/ui';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [d, setD] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState('');
  const [loading, setLoading] = useState(true);

  // Load student's enrolled batches
  useEffect(() => {
    api('/api/me/courses').then((data) => {
      // Extract unique batches from enrollments
      const batchMap = new Map<string, { id: string; name: string; course: string }>();
      for (const enrollment of (data.enrollments ?? [])) {
        const batch = enrollment.batch;
        if (batch && !batchMap.has(batch.id)) {
          batchMap.set(batch.id, {
            id: batch.id,
            name: batch.name,
            course: enrollment.course?.title ?? '',
          });
        }
      }
      const list = [...batchMap.values()];
      setBatches(list);
      if (list.length > 0) setBatchId(list[0].id);
    }).catch(() => {});
    api('/api/me/badges').then((x) => setBadges(x.badges)).catch(() => {});
  }, []);

  // Load leaderboard when batch changes
  useEffect(() => {
    if (!batchId) {
      // No batch — load org-wide as fallback
      setLoading(true);
      api('/api/leaderboard').then(setD).finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    api(`/api/leaderboard?batchId=${batchId}`).then(setD).finally(() => setLoading(false));
  }, [batchId]);

  const selectedBatch = batches.find((b) => b.id === batchId);

  if (loading && !d) return <div className="card"><SkelRows /></div>;
  return (<>
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <div className="card kpi"><div className="lbl">My points</div><div className="num">⚡ {d?.myPoints ?? 0}</div></div>
      {badges.map((b) => (
        <div className="card kpi" key={b.id} style={{ opacity: b.earned ? 1 : 0.4 }}>
          <div className="lbl">{b.earned ? 'Earned' : 'Locked'}</div>
          <div className="num" style={{ fontSize: '1.2rem' }}>{b.icon} {b.name}</div>
          <span className="muted">{b.description} · +{b.pointsReward}pts</span>
        </div>
      ))}
    </div>

    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>
          🏆 Leaderboard {selectedBatch ? `— ${selectedBatch.name}` : '— top learners'}
        </h2>
        {batches.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Batch:</label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              style={{ margin: 0, minWidth: 200 }}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} — {b.course}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? <SkelRows /> : (
        (!d || d.board.length === 0) ? (
          <Empty icon="🏁" text="Complete lessons and quizzes to earn points!" />
        ) : (
          <div className="tablewrap"><table>
            <thead><tr><th>Rank</th><th>Learner</th><th>Points</th></tr></thead>
            <tbody>{d.board.map((r: any) => (
              <tr key={r.userId} style={r.me ? { background: 'var(--brand-50)' } : {}}>
                <td>{MEDAL[r.rank - 1] ?? `#${r.rank}`}</td>
                <td><b>{r.name}</b> {r.me && <span className="badge blue">you</span>}</td>
                <td><b>⚡ {r.points}</b></td>
              </tr>
            ))}</tbody>
          </table></div>
        )
      )}
    </div>
  </>);
}
