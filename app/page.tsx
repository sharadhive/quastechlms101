'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Landing() {
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/catalog?pageSize=6&sort=popular')
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="brand">
          <img src="/logo.png" alt="QUASTECH" style={{ height: 32 }} />
          LMS
        </div>
        <div className="nav-links">
          <a href="#courses">Courses</a>
          <Link href="/register" className="btn btn-sm btn-outline">Register</Link>
          <Link href="/login" className="btn btn-sm">Login</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="content">
          <h1>Learn. Track. Grow.</h1>
          <p>
            Unlock your potential with industry-ready courses, live classes,
            assessments &amp; certificates — all in one platform.
          </p>
          <div className="cta-row">
            <Link href="/register" className="btn btn-accent">Get Started Free</Link>
            <a href="#courses" className="btn btn-outline">Browse Courses</a>
          </div>
          <div className="landing-stats">
            <div className="stat"><div className="n">{courses.length || '10'}+</div><div className="l">Courses</div></div>
            <div className="stat"><div className="n">500+</div><div className="l">Students</div></div>
            <div className="stat"><div className="n">4.8</div><div className="l">Avg Rating</div></div>
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      {courses.length > 0 && (
        <section className="landing-section" id="courses">
          <h2>🚀 Popular Courses</h2>
          <div className="course-grid">
            {courses.map((c) => (
              <Link key={c.id} href={`/app/explore/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="course-card">
                  <div className="thumb">
                    {c.category && <span className="cat">{c.category}</span>}
                    {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={c.title} /> : '📚'}
                  </div>
                  <div className="body">
                    <div className="title">{c.title}</div>
                    <div className="foot">
                      {c.isFree ? (
                        <span className="price-tag free">FREE</span>
                      ) : (
                        <span className="price-tag"><span className="currency">₹</span>{Number(c.price).toLocaleString('en-IN')}</span>
                      )}
                      <span className="course-card-btn">{c.isFree ? 'Start Free' : 'View Details'}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="landing-section" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: 12 }}>Ready to Start Learning?</h2>
        <p style={{ color: '#64748b', fontSize: '1.1rem', marginBottom: 24 }}>
          Create your free account and access courses today.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/register" className="btn btn-accent">Register Free</Link>
          <Link href="/login" className="btn btn-outline">Login</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#0F172A', color: '#64748b', textAlign: 'center', padding: '28px 16px', fontSize: '.82rem' }}>
        <div style={{ marginBottom: 6 }}>
          <img src="/logo.png" alt="QUASTECH" style={{ height: 24, verticalAlign: 'middle', marginRight: 8, background: '#fff', padding: '2px 6px', borderRadius: 4 }} />
          <span style={{ fontWeight: 700, color: '#fff' }}>LMS</span> — EdTech LMS + ERP + CRM
        </div>
        © {new Date().getFullYear()} Quastech. All rights reserved.
      </footer>
    </>
  );
}
