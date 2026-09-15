'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ComboBox from '@/components/ComboBox';

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';

interface Lookups {
  locations: string[];
  colleges: string[];
  educations: string[];
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars">
      {[1,2,3,4,5].map((i) => <span key={i} className={i <= Math.round(rating) ? '' : 'empty'}>★</span>)}
    </span>
  );
}

export default function Landing() {
  const router = useRouter();
  const [courses, setCourses] = useState<any[]>([]);
  const [reg, setReg] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    location: '', education: '', collegeName: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [lookups, setLookups] = useState<Lookups>({ locations: [], colleges: [], educations: [] });

  useEffect(() => {
    fetch('/api/catalog?pageSize=6&sort=popular')
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => {});
    fetch('/api/lookups')
      .then((r) => r.json())
      .then((d) => setLookups(d))
      .catch(() => {});
  }, []);

  const passwordsMatch = reg.confirmPassword.length === 0 || reg.password === reg.confirmPassword;

  const register = async () => {
    if (reg.password !== reg.confirmPassword) {
      setErr('Passwords do not match');
      return;
    }
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: reg.name,
          email: reg.email,
          phone: reg.phone || undefined,
          password: reg.password,
          location: reg.location || undefined,
          education: reg.education || undefined,
          collegeName: reg.collegeName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      localStorage.setItem('qs_role', data.role);
      localStorage.setItem('qs_name', data.name ?? '');
      setDone(true);
      router.push('/app/explore');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

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
          <a href="#register">Register</a>
          <Link href="/login" className="btn btn-sm">Login</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="content">
          <h1>Learn. Track. Grow.</h1>
          <p>
            Unlock your potential with industry-ready courses, live classes,
            assessments & certificates — all in one platform.
          </p>
          <div className="cta-row">
            <a href="#courses" className="btn btn-accent">Browse Courses</a>
            <a href="#register" className="btn btn-outline">Register Free</a>
          </div>
          <div className="landing-stats">
            <div className="stat"><div className="n">{courses.length || '10'}+</div><div className="l">Courses</div></div>
            <div className="stat"><div className="n">500+</div><div className="l">Students</div></div>
            <div className="stat"><div className="n">4.8</div><div className="l">Avg Rating</div></div>
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      <section className="landing-section" id="courses">
        <h2>🚀 Popular Courses</h2>
        <div className="course-grid">
          {courses.map((c) => (
            <Link key={c.id} href={`/app/explore/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="course-card">
                <div className="thumb">
                  {c.category && <span className="cat">{c.category}</span>}
                  {c.thumbnailUrl
                    ? <img src={c.thumbnailUrl} alt={c.title} />
                    : '📚'}
                </div>
                <div className="body">
                  <div className="title">{c.title}</div>
                  <div className="meta">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stars rating={c.avgRating} />
                      <span style={{ fontWeight: 600, color: '#334155' }}>{c.avgRating > 0 ? c.avgRating.toFixed(1) : 'New'}</span>
                    </div>
                    <div className="meta-stat-row">
                      <span>📖 {c.totalLessons} Lessons</span>
                      <span>•</span>
                      <span>👥 {c.enrolledCount} Enrolled</span>
                    </div>
                  </div>
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
        {courses.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Link href="/app/explore" className="btn btn-ghost">View All Courses →</Link>
          </div>
        )}
      </section>

      {/* Registration Section */}
      <section className="landing-section" id="register" style={{ margin: '0 auto 60px', maxWidth: 1100 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          background: 'linear-gradient(135deg, #0F172A, #1E293B)', borderRadius: 24, overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}>
          {/* Left side: Value proposition */}
          <div style={{ padding: '60px 40px', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(124,58,237,0.2), transparent 60%)', pointerEvents: 'none' }}></div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 16, borderBottom: 'none', background: 'linear-gradient(90deg, #fff, #a5f3fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>Start Your Journey Today</h2>
              <p style={{ fontSize: '1.1rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>
                Join thousands of learners on the world's most advanced EdTech platform.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.05rem', color: '#e2e8f0' }}><span style={{ color: '#22c55e', fontSize: '1.4rem' }}>✓</span> Access 100+ premium courses</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.05rem', color: '#e2e8f0' }}><span style={{ color: '#22c55e', fontSize: '1.4rem' }}>✓</span> Track your learning progress</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.05rem', color: '#e2e8f0' }}><span style={{ color: '#22c55e', fontSize: '1.4rem' }}>✓</span> Earn verifiable industry certificates</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.05rem', color: '#e2e8f0' }}><span style={{ color: '#22c55e', fontSize: '1.4rem' }}>✓</span> Learn from expert instructors</li>
              </ul>
            </div>
          </div>
          
          {/* Right side: The form */}
          <div style={{ background: '#fff', padding: '50px 40px' }}>
            {done ? (
              <div className="ok" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🎉</div>
                <b style={{ fontSize: '1.4rem' }}>Welcome aboard!</b>
                <p className="muted" style={{ marginTop: 8 }}>Redirecting to your dashboard…</p>
              </div>
            ) : (<>
              <h3 style={{ fontSize: '1.5rem', marginBottom: 6, textAlign: 'center' }}>Create Free Account</h3>
              <p className="muted" style={{ textAlign: 'center', marginBottom: 28 }}>Quick registration to get started</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Full Name *</label>
                  <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="Your full name" />
                </div>

                <div>
                  <label>Email *</label>
                  <input value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} type="email" placeholder="you@example.com" />
                </div>

                <div>
                  <label>Phone</label>
                  <input value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} placeholder="Mobile number" />
                </div>

                <div>
                  <label>Password *</label>
                  <input value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} type="password" placeholder="Min 6 characters" />
                </div>

                <div>
                  <label>Confirm Password *</label>
                  <input value={reg.confirmPassword} onChange={(e) => setReg({ ...reg, confirmPassword: e.target.value })} type="password"
                    placeholder="Re-enter password"
                    style={!passwordsMatch ? { borderColor: '#ef4444' } : {}} />
                  {!passwordsMatch && (
                    <div style={{ color: '#ef4444', fontSize: '.78rem', marginTop: -8, marginBottom: 8 }}>Passwords do not match</div>
                  )}
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Location</label>
                  <ComboBox
                    id="landing-location"
                    options={lookups.locations}
                    value={reg.location}
                    onChange={(v) => setReg({ ...reg, location: v })}
                    placeholder="Search or add your city…"
                    customLabel="Add location"
                  />
                </div>

                <div>
                  <label>Education</label>
                  <ComboBox
                    id="landing-education"
                    options={lookups.educations}
                    value={reg.education}
                    onChange={(v) => setReg({ ...reg, education: v })}
                    placeholder="Select your qualification…"
                    allowCustom={false}
                  />
                </div>

                <div>
                  <label>College Name</label>
                  <ComboBox
                    id="landing-college"
                    options={lookups.colleges}
                    value={reg.collegeName}
                    onChange={(v) => setReg({ ...reg, collegeName: v })}
                    placeholder="Search or add your college…"
                    customLabel="Add college"
                  />
                </div>
              </div>

              {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
              <button className="btn" style={{ width: '100%', marginTop: 16, padding: 12, fontSize: '1rem' }}
                disabled={busy || !reg.name || !reg.email || reg.password.length < 6 || reg.password !== reg.confirmPassword}
                onClick={register}>
                {busy ? 'Creating account…' : 'Create Account'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 16, fontSize: '.9rem' }}>
                Already have an account? <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 600 }}>Login</Link>
              </p>
            </>)}
          </div>
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

