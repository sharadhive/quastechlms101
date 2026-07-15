'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Kpi, Donut, Bars, HBars, Radial, HeatMap, Empty, SkelRows } from '@/components/ui';

function BannerCarousel({ banners }: { banners: any[] }) {
  const [idx, setIdx] = useState(0);
  const len = banners.length;
  const next = useCallback(() => setIdx((i) => (i + 1) % len), [len]);
  const prev = useCallback(() => setIdx((i) => (i - 1 + len) % len), [len]);

  // Auto-slide every 5 seconds
  useEffect(() => {
    if (len <= 1) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [len, next]);

  if (!len) return null;

  const banner = banners[idx];
  const img = (
    <div className="banner-carousel">
      <div className="banner-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {banners.map((b, i) => (
          <div className="banner-slide" key={b.id}>
            {b.link ? (
              <a href={b.link} target="_blank" rel="noopener noreferrer">
                <img src={b.imageUrl} alt={b.title} draggable={false} />
              </a>
            ) : (
              <img src={b.imageUrl} alt={b.title} draggable={false} />
            )}
          </div>
        ))}
      </div>
      {len > 1 && (
        <>
          <button className="banner-arrow banner-prev" onClick={prev} aria-label="Previous">‹</button>
          <button className="banner-arrow banner-next" onClick={next} aria-label="Next">›</button>
          <div className="banner-dots">
            {banners.map((_, i) => (
              <button
                key={i}
                className={`banner-dot${i === idx ? ' active' : ''}`}
                onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
  return img;
}

export default function StudentHome() {
  const [d, setD] = useState<any>(null);
  const [ann, setAnn] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  useEffect(() => {
    api('/api/me/dashboard').then(setD);
    api('/api/announcements').then((x) => setAnn(x.announcements)).catch(() => {});
    api('/api/banners').then((x) => setBanners(x.banners)).catch(() => {});
  }, []);
  if (!d) return <div className="card"><SkelRows n={5} /></div>;

  return (<>
    {banners.length > 0 && <BannerCarousel banners={banners} />}

    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <Kpi label="My points" value={`⚡ ${d.myPoints}`} />
      <Kpi label="Badges earned" value={`🏅 ${d.badgeCount}`} />
      <Kpi label="Lessons completed" value={d.lessonsDone} />
      <Kpi label="Certificates" value={`🎓 ${d.certificateCount}`} />
    </div>

    <div className="card">
      <h2>📊 My learning snapshot</h2>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'space-around' }}>
        <Radial pct={d.avgProgress} label="Overall progress" color="#7C3AED" />
        <Radial pct={d.attendanceRate} label="My attendance" color="#06B6D4" />
        {d.pendingFees > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--red)' }}>₹{Number(d.pendingFees).toLocaleString('en-IN')}</div>
            <div className="muted">Pending fees</div>
          </div>
        )}
      </div>
    </div>

    <div className="grid grid-2">
      <div className="card">
        <h2>📚 Progress by course</h2>
        <HBars data={d.progressByCourse} />
        {d.statusSplit.length > 0 && (<>
          <h2 style={{ marginTop: 16 }}>Course status</h2>
          <Donut data={d.statusSplit} size={140} thickness={24} />
        </>)}
      </div>
      <div className="card">
        <h2>📈 My quiz scores</h2>
        <Bars data={d.scoreTrend} height={170} />
        <h2 style={{ marginTop: 14 }}>🔥 Learning streak — 8 weeks</h2>
        <HeatMap days={d.activity} />
        <p className="muted" style={{ marginTop: 6 }}>Each square is a day · darker = more lessons finished</p>
      </div>
    </div>

    {ann.length > 0 && (
      <div className="card">
        <h2>📣 Announcements</h2>
        {ann.slice(0, 4).map((a: any) => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
            <b>{a.title}</b> <span className="muted">· {new Date(a.createdAt).toLocaleDateString()}</span>
            <p className="muted" style={{ margin: '4px 0 0' }}>{a.message}</p>
          </div>
        ))}
      </div>
    )}

    <div className="card">
      <h2>Today's classes</h2>
      {d.todaysClasses.length === 0 ? <Empty icon="🎉" text="No classes today" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Class</th><th>Course</th><th>Time</th><th></th></tr></thead>
          <tbody>{d.todaysClasses.map((s: any) => (
            <tr key={s.id}>
              <td><b>{s.title}</b></td>
              <td>{s.batch.course.title}</td>
              <td>{new Date(s.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{s.meetLink
                ? <a className="btn btn-sm" href={s.meetLink} target="_blank">Join {s.startedAt ? '● LIVE' : ''}</a>
                : <span className="badge gray">Scheduled</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>

    <div className="card">
      <h2>Continue learning</h2>
      {d.continueLearning.length === 0 ? <Empty icon="📚" text="No active courses yet" /> : (
        <div className="grid grid-4">
          {d.continueLearning.map((e: any) => (
            <Link key={e.id} href={`/app/courses/${e.id}`}>
              <div className="card" style={{ marginBottom: 0 }}>
                <b>{e.course.title}</b>
                <div className="progressbar" style={{ margin: '8px 0 6px' }}><div style={{ width: `${e.progressPct}%` }} /></div>
                <span className="muted">{Math.round(Number(e.progressPct))}% complete</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  </>);
}
