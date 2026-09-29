'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';

function Stars({ rating, size }: { rating: number; size?: string }) {
  return (
    <span className="stars" style={size ? { fontSize: size } : {}}>
      {[1,2,3,4,5].map((i) => <span key={i} className={i <= Math.round(rating) ? '' : 'empty'}>★</span>)}
    </span>
  );
}

export default function CourseDetail() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const [course, setCourse] = useState<any>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [enquirySent, setEnquirySent] = useState(false);

  useEffect(() => {
    // Fetch course detail
    fetch(`/api/catalog/${courseId}`).then((r) => r.json()).then((d) => setCourse(d.course)).catch(() => {});
    // Check enrollment
    api('/api/me/courses').then((d) => {
      const enr = (d.enrollments ?? []).find((e: any) => (e.courseId ?? e.course?.id) === courseId);
      if (enr) { setEnrolled(true); setEnrollmentId(enr.id); }
    }).catch(() => {});
  }, [courseId]);

  const enrollFree = async () => {
    setBusy('enroll'); setErr('');
    try {
      await api('/api/catalog/enroll-free', { method: 'POST', json: { courseId } });
      setEnrolled(true);
      router.push('/app/courses');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  };

  const buyNow = async () => {
    setBusy('buy'); setErr('');
    try {
      const res = await api('/api/payments/initiate', { method: 'POST', json: { courseId } });
      window.location.href = res.paymentUrl;
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  };

  const requestCounselling = async () => {
    setBusy('counsel');
    try {
      const orgId = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          name: localStorage.getItem('qs_name') ?? 'Student',
          email: '', phone: '',
          courseInterest: course?.title ?? '',
          source: 'counselling_request',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not send your request');
      setEnquirySent(true);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  };

  if (!course) return <div className="card"><div className="muted" style={{ padding: 40, textAlign: 'center' }}>Loading course…</div></div>;

  const isFree = course.isFree;

  return (
    <div className="course-detail">
      {/* Main Column */}
      <div className="main-col">
        <div className="hero-banner">
          {course.thumbnailUrl
            ? <img src={course.thumbnailUrl} alt={course.title} />
            : '📚'}
        </div>

        <div className="card">
          {course.category && <span className="cat" style={{ marginBottom: 12, display: 'inline-block', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--brand)', background: 'var(--brand-50)', padding: '3px 10px', borderRadius: 99 }}>{course.category}</span>}
          <h1 style={{ fontSize: '1.4rem', marginBottom: 12 }}>{course.title}</h1>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className="muted">📦 {course.totalModules} modules</span>
            <span className="muted">📝 {course.totalLessons} lessons</span>
            <span className="muted">👥 {course.enrolledCount} enrolled</span>
            <span><Stars rating={course.avgRating} /> <span className="muted">{course.avgRating} ({course.reviewCount} reviews)</span></span>
          </div>

          {course.description && (
            <div style={{ lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {course.description}
            </div>
          )}
        </div>

        {/* Curriculum */}
        <div className="card">
          <h2>📋 Curriculum</h2>
          <div className="curriculum-tree">
            {(course.curriculum ?? []).map((mod: any, i: number) => (
              <div className="curriculum-mod" key={i}>
                <div className="curriculum-mod-head">
                  <span>Module {mod.position + 1}: {mod.moduleTitle}</span>
                  <span className="muted" style={{ fontSize: '.78rem' }}>
                    {mod.sections.reduce((a: number, s: any) => a + s.lessonCount, 0)} lessons
                  </span>
                </div>
                <div className="curriculum-mod-body">
                  {mod.sections.map((sec: any, j: number) => (
                    <div className="curriculum-sec" key={j}>
                      <span>📄 {sec.title}</span>
                      <span className="muted">{sec.lessonCount} lesson{sec.lessonCount !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(course.curriculum ?? []).length === 0 && (
              <p className="muted">Curriculum will be updated soon.</p>
            )}
          </div>
        </div>

        {/* Reviews */}
        {(course.reviews ?? []).length > 0 && (
          <div className="card">
            <h2>⭐ Student Reviews</h2>
            {course.reviews.map((r: any, i: number) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <b>{r.reviewer}</b>
                  <Stars rating={r.rating} />
                </div>
                {r.title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.title}</div>}
                {r.comment && <p className="muted" style={{ margin: 0 }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="sidebar-col">
        <div className="price-card">
          {isFree ? (
            <div className="big-price free">FREE</div>
          ) : (
            <div className="big-price">₹{Number(course.price).toLocaleString('en-IN')}</div>
          )}

          {enrolled ? (
            <>
              <Link href={enrollmentId ? `/app/courses/${enrollmentId}` : '/app/courses'} className="btn" style={{ width: '100%', marginBottom: 10, display: 'block', textAlign: 'center' }}>
                Continue Learning →
              </Link>
              <p className="muted">You are enrolled in this course.</p>
            </>
          ) : isFree ? (
            <button className="btn" style={{ width: '100%' }} onClick={enrollFree} disabled={busy === 'enroll'}>
              {busy === 'enroll' ? 'Enrolling…' : '🎓 Start Free Course'}
            </button>
          ) : (
            <button className="btn" style={{ width: '100%' }} onClick={buyNow} disabled={busy === 'buy'}>
              {busy === 'buy' ? 'Redirecting to payment…' : '🛒 Buy Now'}
            </button>
          )}

          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
            {enquirySent ? (
              <div className="ok">✅ Counselling request sent! Our team will contact you.</div>
            ) : (
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={requestCounselling} disabled={busy === 'counsel'}>
                {busy === 'counsel' ? 'Sending…' : '💬 Request Counselling'}
              </button>
            )}
          </div>

          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <div className="muted" style={{ fontSize: '.78rem', marginBottom: 6 }}>This course includes:</div>
            <div style={{ fontSize: '.84rem', lineHeight: 2 }}>
              📦 {course.totalModules} modules<br/>
              📝 {course.totalLessons} lessons<br/>
              🎓 Certificate on completion<br/>
              📱 Access on all devices
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
