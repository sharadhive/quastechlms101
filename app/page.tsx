'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';

export default function Landing() {
  const [f, setF] = useState({ name: '', email: '', phone: '', courseInterest: '' });
  const [sent, setSent] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try { await api('/api/enquiries', { method: 'POST', json: { ...f, organizationId: ORG_ID } }); setSent(true); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--indigo)' }}>QUASTECH OS</div>
        <a className="btn btn-sm" href="/login">Login</a>
      </div>
      <h1 style={{ fontSize: '2.2rem', marginTop: 60 }}>Learn. Track. Grow.</h1>
      <p className="muted" style={{ fontSize: '1.05rem' }}>Courses, live classes, assessments and certificates — all in one place.</p>
      <div className="card" style={{ maxWidth: 460, marginTop: 40 }}>
        <h2 style={{ marginTop: 0 }}>Enquire now</h2>
        {sent ? <div className="ok">Thank you! Our team will contact you shortly.</div> : (<>
          <label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <label>Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <label>Course of interest</label><input value={f.courseInterest} onChange={(e) => setF({ ...f, courseInterest: e.target.value })} />
          {err && <div className="err">{err}</div>}
          <button className="btn" onClick={submit} disabled={!f.name || (!f.email && !f.phone)}>Submit enquiry</button>
        </>)}
      </div>
    </div>
  );
}
