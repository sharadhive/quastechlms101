'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';

export default function LearnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [l, setL] = useState<any>(null);
  const [pay, setPay] = useState<Record<string, { amount: string; mode: string }>>({});
  const [msg, setMsg] = useState('');
  const load = () => api(`/api/learners/${id}`).then((d) => setL(d.learner));
  useEffect(() => { load(); }, [id]);
  const record = async (enrollmentId: string) => {
    const p = pay[enrollmentId]; if (!p?.amount) return;
    setMsg('');
    try {
      const d = await api(`/api/fees/${enrollmentId}/payments`, { method: 'POST', json: { amount: Number(p.amount), mode: p.mode ?? 'CASH' } });
      setMsg(`Payment recorded — receipt ${d.receiptNo}`); load();
    } catch (e: any) { setMsg(e.message); }
  };
  if (!l) return <p className="muted">Loading…</p>;
  return (<>
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{l.name} <span className="badge gray">{l.lifecycle}</span></h2>
      <p className="muted">{l.email} · {l.phone ?? 'no phone'}</p>
    </div>
    {msg && <div className="card ok">{msg}</div>}
    <h2>Enrollments & Fees</h2>
    {l.enrollments.map((e: any) => (
      <div className="card" key={e.id}>
        <b>{e.course.title}</b> — {e.batch.name} <span className="badge green">{e.status}</span>
        <div className="progressbar" style={{ margin: '10px 0' }}><div style={{ width: `${e.progressPct}%` }} /></div>
        <p className="muted">Progress {e.progressPct}% · Fee ₹{e.feeAccount?.totalFee ?? 0} · Discount ₹{e.feeAccount?.discount ?? 0} · <b>Pending ₹{e.feeAccount?.pendingAmount ?? 0}</b></p>
        {Number(e.feeAccount?.pendingAmount ?? 0) > 0 && (
          <div className="row" style={{ maxWidth: 480 }}>
            <input placeholder="Amount" type="number" value={pay[e.id]?.amount ?? ''} onChange={(ev) => setPay({ ...pay, [e.id]: { amount: ev.target.value, mode: pay[e.id]?.mode ?? 'CASH' } })} />
            <select value={pay[e.id]?.mode ?? 'CASH'} onChange={(ev) => setPay({ ...pay, [e.id]: { amount: pay[e.id]?.amount ?? '', mode: ev.target.value } })}>
              <option>CASH</option><option>UPI</option><option>CHEQUE</option><option>BANK</option>
            </select>
            <button className="btn" style={{ flex: '0 0 auto' }} onClick={() => record(e.id)}>Record payment</button>
          </div>
        )}
      </div>
    ))}
  </>);
}
