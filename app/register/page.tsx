'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ComboBox from '@/components/ComboBox';

interface Lookups {
  locations: string[];
  colleges: string[];
  educations: string[];
}

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    location: '', education: '', collegeName: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookups, setLookups] = useState<Lookups>({ locations: [], colleges: [], educations: [] });

  // Fetch dropdown data from DB on mount
  useEffect(() => {
    fetch('/api/lookups')
      .then((r) => r.json())
      .then((d) => setLookups(d))
      .catch(() => {});
  }, []);

  const strength = f.password.length === 0 ? 0 : f.password.length < 6 ? 1 : f.password.length < 10 ? 2 : 3;
  const strengthColor = ['#e5e7eb', '#ef4444', '#f59e0b', '#22c55e'][strength];
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'][strength];

  const passwordsMatch = f.confirmPassword.length === 0 || f.password === f.confirmPassword;

  const canSubmit = f.name && f.email && f.password.length >= 6
    && f.password === f.confirmPassword && !busy;

  const submit = async () => {
    if (f.password !== f.confirmPassword) {
      setErr('Passwords do not match');
      return;
    }
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name,
          email: f.email,
          phone: f.phone || undefined,
          password: f.password,
          location: f.location || undefined,
          education: f.education || undefined,
          collegeName: f.collegeName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      localStorage.setItem('qs_role', data.role);
      localStorage.setItem('qs_name', data.name ?? '');
      router.push('/app/explore');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-split">
      <div className="auth-split-left">
        <div className="auth-split-left-content">
          <h2>Start Your Journey Today</h2>
          <p>Create a free account to unlock courses, access premium materials, and take the first step toward advancing your career.</p>
        </div>
      </div>
      <div className="auth-split-right">
        <div className="auth-split-card" style={{ maxWidth: 500 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <img src="/logo.png" alt="QUASTECH" style={{ height: 40 }} />
            LMS
          </h1>
          <p className="sub">Create your free account to start learning</p>

        <label>Full Name *</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your full name" autoFocus />

        <label>Email *</label>
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="you@example.com" />

        <label>Phone</label>
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Mobile number (optional)" />

        <label>Password *</label>
        <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} type="password"
          placeholder="Min 6 characters" />
        {f.password.length > 0 && (
          <div className="pass-strength">
            <div className="bar" style={{ width: `${(strength / 3) * 100}%`, background: strengthColor }} />
            <span style={{ fontSize: '.72rem', color: strengthColor, marginLeft: 6 }}>{strengthLabel}</span>
          </div>
        )}

        <label>Confirm Password *</label>
        <input value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} type="password"
          placeholder="Re-enter your password"
          style={!passwordsMatch ? { borderColor: '#ef4444' } : {}} />
        {!passwordsMatch && (
          <div style={{ color: '#ef4444', fontSize: '.78rem', marginTop: 2 }}>Passwords do not match</div>
        )}

        <label>Location</label>
        <ComboBox
          id="reg-location"
          options={lookups.locations}
          value={f.location}
          onChange={(v) => setF({ ...f, location: v })}
          placeholder="Search or add your city…"
          customLabel="Add location"
        />

        <label>Education</label>
        <ComboBox
          id="reg-education"
          options={lookups.educations}
          value={f.education}
          onChange={(v) => setF({ ...f, education: v })}
          placeholder="Select your qualification…"
          allowCustom={false}
        />

        <label>College Name</label>
        <ComboBox
          id="reg-college"
          options={lookups.colleges}
          value={f.collegeName}
          onChange={(v) => setF({ ...f, collegeName: v })}
          placeholder="Search or add your college…"
          customLabel="Add college"
        />

        {err && <div className="err">{err}</div>}

        <button className="btn" style={{ width: '100%' }} disabled={!canSubmit} onClick={submit}>
          {busy ? 'Creating account…' : 'Create Account'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link href="/login">Login</Link>
        </p>
      </div>
    </div>
    </div>
  );
}
