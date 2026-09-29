'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Enroll() {
  const [q, setQ] = useState(''); const [found, setFound] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [learner, setLearner] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]); const [courseId, setCourseId] = useState('');
  const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState('');
  const [fee, setFee] = useState({ totalFee: '', discount: '0', amount: '', mode: 'CASH', referenceNo: '' });
  const [result, setResult] = useState<any>(null); const [err, setErr] = useState('');
  const [converting, setConverting] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => { api('/api/courses?status=PUBLISHED').then((d) => setCourses(d.courses)); }, []);
  // Opened from a learner profile → learner already chosen
  useEffect(() => {
    const lid = new URLSearchParams(window.location.search).get('learnerId');
    if (lid) api(`/api/learners/${lid}`).then((d) => setLearner(d.learner)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!courseId) return setBatches([]);
    api(`/api/courses/${courseId}`).then((d) => setBatches(d.course.batches)); // batches auto-load (SRS 2.5)
  }, [courseId]);

  const search = async () => {
    setSearched(true);
    const [learnerRes, enquiryRes] = await Promise.all([
      api(`/api/learners?q=${encodeURIComponent(q)}`),
      api(`/api/enquiries?q=${encodeURIComponent(q)}`),
    ]);
    setFound(learnerRes.learners);
    // Filter out enquiries that already have a matching learner (by email)
    const learnerEmails = new Set(learnerRes.learners.map((l: any) => l.email?.toLowerCase()));
    const filteredEnquiries = enquiryRes.enquiries.filter(
      (e: any) => !e.email || !learnerEmails.has(e.email.toLowerCase())
    );
    setEnquiries(filteredEnquiries);
  };

  const convertEnquiry = async (enquiry: any) => {
    setConverting(enquiry.id);
    setErr('');
    try {
      const d = await api(`/api/enquiries/${enquiry.id}/convert`, { method: 'POST' });
      if (d.alreadyExists) {
        setLearner(d.learner);
      } else {
        setLearner(d.learner);
        alert(`Learner account created.\n\nTemporary password: ${d.tempPassword}\n\nIt was also emailed to the learner (if an email was given). Copy it now — it is not stored.`);
      }
    } catch (e: any) { setErr(e.message); } finally { setConverting(null); }
  };

  const submit = async () => {
    setErr('');
    try {
      const d = await api('/api/enrollments/manual', {
        method: 'POST',
        json: {
          learnerId: learner.id, batchId,
          fee: {
            totalFee: Number(fee.totalFee), discount: Number(fee.discount || 0),
            ...(Number(fee.amount) > 0 ? { firstPayment: { amount: Number(fee.amount), mode: fee.mode, referenceNo: fee.referenceNo || undefined } } : {}),
          },
        },
      });
      setResult(d);
    } catch (e: any) { setErr(e.message); }
  };

  if (result) return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>✅ Enrolled successfully</h2>
      <p>Pending amount: <b>₹{result.pendingAmount}</b>{result.receiptNo && <> · Receipt: <b>{result.receiptNo}</b></>}</p>
      <p className="muted">Enrolment email queued — the course is live in the student panel immediately.</p>
      {learner && <p><a href={`/admin/learners/${learner.id}`}>Open {learner.name}’s profile →</a></p>}
      <button className="btn" onClick={() => { setResult(null); setLearner(null); setQ(''); setFound([]); setEnquiries([]); setSearched(false); setCourseId(''); setBatchId(''); setFee({ totalFee: '', discount: '0', amount: '', mode: 'CASH', referenceNo: '' }); }}>Enroll another</button>
    </div>
  );

  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>1 · Find learner</h2>
      {learner ? <p><b>{learner.name}</b> — {learner.email} <button className="btn btn-ghost btn-sm" onClick={() => setLearner(null)}>change</button></p> : (<>
        <div className="row">
          <input placeholder="Phone / email / name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button className="btn" style={{ flex: '0 0 auto' }} onClick={search}>Search</button>
        </div>

        {/* Existing learners */}
        {found.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ marginBottom: 4, fontWeight: 600, fontSize: 13 }}>📋 Existing Learners</p>
            {found.map((l) => <p key={l.id} style={{ margin: '4px 0' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setLearner(l); }}>{l.name}</a> — {l.email} · {l.phone ?? ''}
            </p>)}
          </div>
        )}

        {/* Enquiries (not yet learners) */}
        {enquiries.length > 0 && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef9e7', borderRadius: 8, border: '1px solid #f0e0a0' }}>
            <p className="muted" style={{ marginBottom: 4, fontWeight: 600, fontSize: 13 }}>📩 From Enquiries (not yet learners)</p>
            {enquiries.map((e) => <p key={e.id} style={{ margin: '6px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span><b>{e.name}</b> — {e.email ?? ''} {e.phone ?? ''} {e.courseInterest ? <span className="badge gray">{e.courseInterest}</span> : ''}</span>
              <button
                className="btn btn-sm"
                style={{ fontSize: 12, padding: '2px 10px' }}
                disabled={converting === e.id}
                onClick={() => convertEnquiry(e)}
              >
                {converting === e.id ? 'Converting…' : 'Convert & Select'}
              </button>
            </p>)}
          </div>
        )}

        {found.length === 0 && enquiries.length === 0 && searched && q && (
          <p className="muted">Not found in learners or enquiries. <a href="/admin/learners">Create the learner manually</a>.</p>
        )}
      </>)}
    </div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>2 · Course & batch</h2>
      <div className="row">
        <div><label>Course</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Select…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select></div>
        <div><label>Batch</label><select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">Select…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}{b._count ? ` · ${b._count.enrollments} students` : ''}</option>)}
        </select></div>
      </div>
      {courseId && batches.length === 0 && (
        <p className="muted">This course has no batch yet. <a href={`/admin/batches?courseId=${courseId}`}>Create a batch first →</a></p>
      )}
    </div>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>3 · Fee (manual — SRS 2.5)</h2>
      <div className="row">
        <div><label>Total fee ₹</label><input type="number" value={fee.totalFee} onChange={(e) => setFee({ ...fee, totalFee: e.target.value })} /></div>
        <div><label>Discount ₹</label><input type="number" value={fee.discount} onChange={(e) => setFee({ ...fee, discount: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Amount received now ₹</label><input type="number" value={fee.amount} onChange={(e) => setFee({ ...fee, amount: e.target.value })} /></div>
        <div><label>Mode</label><select value={fee.mode} onChange={(e) => setFee({ ...fee, mode: e.target.value })}>
          <option>CASH</option><option>UPI</option><option>CHEQUE</option><option>BANK</option>
        </select></div>
        <div><label>Reference no.</label><input value={fee.referenceNo} onChange={(e) => setFee({ ...fee, referenceNo: e.target.value })} /></div>
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn" onClick={submit} disabled={!learner || !batchId || !fee.totalFee}>Enroll & record fee</button>
    </div>
  </>);
}
