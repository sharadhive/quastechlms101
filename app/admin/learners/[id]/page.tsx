'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import CredentialsCard from '@/components/CredentialsCard';

const STATUS_BADGE: Record<string, string> = { ACTIVE: 'green', COMPLETED: 'blue', DROPPED: 'red', EXPIRED: 'gray' };
const inr = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
const toLocalInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export default function LearnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [l, setL] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [pay, setPay] = useState<Record<string, { amount: string; mode: string; ref: string }>>({});
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [creds, setCreds] = useState<any>(null);

  const load = () => api(`/api/learners/${id}`).then((d) => setL(d.learner)).catch((e) => setErr(e.message));
  useEffect(() => { load(); api('/api/branches').then((d) => setBranches(d.branches)).catch(() => {}); }, [id]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setErr(''); setMsg('');
    try { await fn(); setMsg(ok); await load(); } catch (e: any) { setErr(e.message); }
  };
  const patchEnr = (enrollmentId: string, json: any, ok: string) =>
    act(() => api(`/api/enrollments/${enrollmentId}`, { method: 'PATCH', json }), ok);
  const record = (e: any) => {
    const p = pay[e.id]; if (!p?.amount) return;
    return act(async () => {
      const d = await api(`/api/fees/${e.id}/payments`, { method: 'POST', json: { amount: Number(p.amount), mode: p.mode || 'CASH', referenceNo: p.ref || undefined } });
      setPay({ ...pay, [e.id]: { amount: '', mode: 'CASH', ref: '' } });
      return d;
    }, 'Payment recorded ✓ — receipt is being generated');
  };
  const openReceipt = async (paymentId: string) => {
    const w = window.open('', '_blank');
    try { const d = await api(`/api/fees/payments/${paymentId}/receipt`); if (w) w.location.href = d.url; }
    catch (e: any) { w?.close(); setErr(e.message); }
  };
  const openCert = async (certId: string) => {
    const w = window.open('', '_blank');
    try { const d = await api(`/api/certificates/${certId}`); if (w) w.location.href = d.url; }
    catch (e: any) { w?.close(); setErr(e.message); }
  };

  if (err && !l) return <div className="card err">{err}</div>;
  if (!l) return <p className="muted">Loading…</p>;
  const branch = branches.find((b) => b.id === l.branchId);

  return (<>
    <div className="card">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}><Link href="/admin/learners">← Learners</Link></div>
          <h1 style={{ marginTop: 4 }}>{l.name}{' '}
            <span className="badge gray">{l.lifecycle ?? '—'}</span>{' '}
            {!l.isActive && <span className="badge red">Deactivated</span>}
          </h1>
          <div className="sub">{l.email} · {l.phone ?? 'no phone'} · {branch ? `${branch.name}, ${branch.city}` : 'no branch'} · joined {new Date(l.createdAt).toLocaleDateString()}</div>
        </div>
        <div className="actions">
          <Link className="btn" href={`/admin/enroll?learnerId=${l.id}`}>＋ Enrol in a course</Link>
          <button className="btn btn-ghost" onClick={() => setEdit({ name: l.name, email: l.email, phone: l.phone ?? '', branchId: l.branchId ?? '' })}>✎ Edit</button>
          <button className="btn btn-ghost" onClick={() => confirm(`Reset password for ${l.name}?`) && act(async () => {
            const d = await api(`/api/learners/${l.id}/reset-password`, { method: 'POST' }); setCreds({ ...d.user, password: d.tempPassword });
          }, 'New temporary password created')}>🔄 Reset password</button>
          <button className={`btn ${l.isActive ? 'btn-danger' : ''}`} onClick={() =>
            (!l.isActive || confirm(`Deactivate ${l.name}? They are signed out and cannot log in until reactivated.`))
            && act(() => api(`/api/learners/${l.id}`, { method: 'PATCH', json: { isActive: !l.isActive } }), l.isActive ? 'Learner deactivated' : 'Learner reactivated')}>
            {l.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
      {msg && <div className="ok">{msg}</div>}{err && <div className="err">{err}</div>}
      {creds && <CredentialsCard name={creds.name} email={creds.email} phone={creds.phone} password={creds.password} onClose={() => setCreds(null)} />}
    </div>

    {edit && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <h2>Edit learner</h2>
        <div className="row">
          <div><label>Name</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><label>Email (login)</label><input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
          <div><label>Phone</label><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
          <div><label>Branch</label>
            <select value={edit.branchId} onChange={(e) => setEdit({ ...edit, branchId: e.target.value })}>
              <option value="">No branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => act(async () => {
            await api(`/api/learners/${l.id}`, { method: 'PATCH', json: { name: edit.name, email: edit.email, phone: edit.phone || null, branchId: edit.branchId || null } });
            setEdit(null);
          }, 'Learner updated ✓')}>Save</button>
          <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </div>
    )}

    <h2 style={{ margin: '18px 0 10px' }}>Courses, fees &amp; certificates</h2>
    {l.enrollments.length === 0 && <div className="card"><p className="muted">Not enrolled in any course yet.</p></div>}
    {l.enrollments.map((e: any) => {
      const fee = e.feeAccount;
      const otherBatches = e.course.batches.filter((b: any) => b.id !== e.batch?.id);
      return (
        <div className="card" key={e.id}>
          <div className="page-head" style={{ marginBottom: 6 }}>
            <div>
              <b style={{ fontSize: '1rem' }}>{e.course.title}</b>{' '}
              <span className={`badge ${STATUS_BADGE[e.status] ?? 'gray'}`}>{e.status}</span>
              <div className="sub">
                {e.batch ? `Batch: ${e.batch.name}` : 'Self-paced (no batch)'} · enrolled {new Date(e.enrolledAt).toLocaleDateString()}
                {e.accessExpiry ? ` · access until ${new Date(e.accessExpiry).toLocaleDateString()}` : ''}
              </div>
            </div>
            <div className="actions">
              {e.status === 'ACTIVE' || e.status === 'COMPLETED'
                ? <button className="btn btn-danger btn-sm" onClick={() => confirm(`Drop ${l.name} from ${e.course.title}? They lose access to the course.`) && patchEnr(e.id, { status: 'DROPPED' }, 'Enrollment dropped')}>Drop</button>
                : <button className="btn btn-sm" onClick={() => patchEnr(e.id, { status: 'ACTIVE' }, 'Enrollment reactivated ✓')}>Reactivate</button>}
            </div>
          </div>
          <div className="progressbar" style={{ margin: '6px 0' }}><div style={{ width: `${e.progressPct}%` }} /></div>
          <p className="muted" style={{ margin: '0 0 10px' }}>Course progress {Number(e.progressPct)}%</p>

          <div className="grid grid-2">
            <div className="panel-inline" style={{ margin: 0 }}>
              <b>🎓 Batch &amp; access</b>
              <label style={{ display: 'block', marginTop: 8 }}>Move to another batch of this course</label>
              <select defaultValue="" onChange={(ev) => ev.target.value && patchEnr(e.id, { batchId: ev.target.value === '__none' ? null : ev.target.value }, 'Batch changed ✓')}>
                <option value="">{otherBatches.length ? 'Choose batch…' : 'No other batches'}</option>
                {otherBatches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}{b.capacity ? ` (${b._count.enrollments}/${b.capacity})` : ''}</option>
                ))}
                {e.batch && <option value="__none">Remove from batch (self-paced)</option>}
              </select>
              <label>Access end date (empty = no limit)</label>
              <div className="row">
                <input type="date" defaultValue={toLocalInput(e.accessExpiry)} id={`exp-${e.id}`} />
                <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }} onClick={() => {
                  const v = (document.getElementById(`exp-${e.id}`) as HTMLInputElement).value;
                  patchEnr(e.id, { accessExpiry: v ? new Date(`${v}T23:59:59`).toISOString() : null }, 'Access date saved ✓');
                }}>Save</button>
              </div>
              <b>📜 Certificate</b>
              <div style={{ marginTop: 6 }}>
                {e.certificate ? (
                  <div className="actions">
                    <span className={`badge ${e.certificate.revokedAt ? 'red' : 'green'}`}>{e.certificate.revokedAt ? 'Revoked' : 'Issued'}</span>
                    <span className="muted" style={{ fontSize: '.8rem' }}>Code {e.certificate.verifyCode}</span>
                    {e.certificate.pdfKey && <button className="btn btn-ghost btn-sm" onClick={() => openCert(e.certificate.id)}>Open PDF</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => act(() => api(`/api/certificates/${e.certificate.id}`, { method: 'PATCH', json: { revoked: !e.certificate.revokedAt } }), e.certificate.revokedAt ? 'Certificate restored' : 'Certificate revoked')}>
                      {e.certificate.revokedAt ? 'Restore' : 'Revoke'}
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => confirm('Issue the completion certificate now?') && act(() => api('/api/certificates/issue', { method: 'POST', json: { enrollmentId: e.id } }), 'Certificate issued — PDF is being generated')}>Issue certificate</button>
                )}
              </div>
            </div>

            <div className="panel-inline" style={{ margin: 0 }}>
              <b>💰 Fees</b>
              {fee ? (<>
                <p className="muted" style={{ margin: '6px 0' }}>Fee {inr(fee.totalFee)} · Discount {inr(fee.discount)} · <b style={{ color: Number(fee.pendingAmount) > 0 ? 'var(--red)' : 'var(--green)' }}>Pending {inr(fee.pendingAmount)}</b></p>
                {Number(fee.pendingAmount) > 0 && (
                  <div className="row">
                    <input placeholder="Amount" type="number" value={pay[e.id]?.amount ?? ''} onChange={(ev) => setPay({ ...pay, [e.id]: { ...(pay[e.id] ?? { mode: 'CASH', ref: '' }), amount: ev.target.value } })} />
                    <select value={pay[e.id]?.mode ?? 'CASH'} onChange={(ev) => setPay({ ...pay, [e.id]: { ...(pay[e.id] ?? { amount: '', ref: '' }), mode: ev.target.value } })}>
                      <option>CASH</option><option>UPI</option><option>CHEQUE</option><option>BANK</option>
                    </select>
                    <input placeholder="Ref / UTR (optional)" value={pay[e.id]?.ref ?? ''} onChange={(ev) => setPay({ ...pay, [e.id]: { ...(pay[e.id] ?? { amount: '', mode: 'CASH' }), ref: ev.target.value } })} />
                    <button className="btn btn-sm" style={{ flex: '0 0 auto', marginTop: 4 }} onClick={() => record(e)} disabled={!pay[e.id]?.amount}>Record</button>
                  </div>
                )}
                {fee.payments.length > 0 && (
                  <table style={{ marginTop: 6 }}>
                    <thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Receipt</th></tr></thead>
                    <tbody>{fee.payments.map((p: any) => (
                      <tr key={p.id}><td>{new Date(p.receivedAt).toLocaleDateString()}</td><td>{inr(p.amount)}</td>
                        <td>{p.mode}{p.referenceNo ? <span className="muted"> · {p.referenceNo}</span> : ''}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => openReceipt(p.id)}>🧾 {p.receiptNo}</button></td></tr>
                    ))}</tbody>
                  </table>
                )}
              </>) : <p className="muted">No fee account (free course).</p>}
            </div>
          </div>
        </div>
      );
    })}
  </>);
}
