'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { SkelRows, Empty } from '@/components/ui';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [d, setD] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  useEffect(() => {
    api('/api/leaderboard').then(setD);
    api('/api/me/badges').then((x) => setBadges(x.badges));
  }, []);
  if (!d) return <div className="card"><SkelRows /></div>;
  return (<>
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <div className="card kpi"><div className="lbl">My points</div><div className="num">⚡ {d.myPoints}</div></div>
      {badges.map((b) => (
        <div className="card kpi" key={b.id} style={{ opacity: b.earned ? 1 : 0.4 }}>
          <div className="lbl">{b.earned ? 'Earned' : 'Locked'}</div>
          <div className="num" style={{ fontSize: '1.2rem' }}>{b.icon} {b.name}</div>
          <span className="muted">{b.description} · +{b.pointsReward}pts</span>
        </div>
      ))}
    </div>
    <div className="card">
      <h2>🏆 Leaderboard — top learners</h2>
      {d.board.length === 0 ? <Empty icon="🏁" text="Complete lessons and quizzes to earn points!" /> : (
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
      )}
    </div>
  </>);
}
