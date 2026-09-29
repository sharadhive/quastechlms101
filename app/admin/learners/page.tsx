'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Empty, SkelRows, GeoFilter, geoQuery } from '@/components/ui';
import CredentialsCard from '@/components/CredentialsCard';

const LIFECYCLES = ['', 'LEAD', 'ENQUIRY', 'ENROLLED', 'ACTIVE', 'COMPLETED', 'DROPPED'];

export default function Learners() {
  const [q, setQ] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [geo, setGeo] = useState({ state: '', city: '', branchId: '' });
  const [branches, setBranches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', branchId: '' });
  const [err, setErr] = useState('');
  const [creds, setCreds] = useState<any>(null);

  const PAGE = 25;
  const load = (p = page) => {
    setRows(null);
    return api(`/api/learners?${geoQuery(geo, { q, lifecycle, page: String(p), pageSize: String(PAGE) })}`)
      .then((d) => { setRows(d.learners); setTotal(d.total); });
  };
  useEffect(() => { api('/api/branches').then((d) => setBranches(d.branches)); }, []);
  useEffect(() => { setPage(1); load(1); }, [geo.state, geo.city, geo.branchId, lifecycle]);

  const bInfo = (id: string) => branches.find((b) => b.id === id);

  const create = async () => {
    setErr(''); setCreds(null);
    try {
      const d = await api('/api/learners', { method: 'POST', json: { name: f.name, email: f.email, phone: f.phone || undefined, branchId: f.branchId || undefined } });
      setCreds({ ...d.learner, password: d.tempPassword, id: d.learner.id });
      setF({ name: '', email: '', phone: '', branchId: '' }); load(1);
    } catch (e: any) { setErr(e.message); }
  };
  const reset = async (l: any) => {
    if (!confirm(`Reset the password for ${l.name}? A new temporary password is emailed to them.`)) return;
    try { const d = await api(`/api/learners/${l.id}/reset-password`, { method: 'POST' }); setCreds({ ...d.user, password: d.tempPassword }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e: any) { alert(e.message); }
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (<>
    <div className="page-head">
      <div>
        <h1>🧑‍🎓 Learners</h1>
        <div className="sub">Search, add and manage students. Open a learner to see courses, fees, certificates and to drop / move / reactivate.</div>
      </div>
      <div className="actions">
        <Link className="btn btn-ghost" href="/admin/enroll">＋ Enrol in a course</Link>
        <button className="btn" onClick={() => setShowNew(!showNew)}>{showNew ? 'Close' : '＋ Add learner'}</button>
      </div>
    </div>

    {creds && (
      <div className="card">
        <CredentialsCard name={creds.name} email={creds.email} phone={creds.phone} password={creds.password} onClose={() => setCreds(null)} />
        {creds.id && <Link className="btn btn-sm" href={`/admin/enroll?learnerId=${creds.id}`}>Next: enrol {creds.name} in a course →</Link>}
      </div>
    )}

    {showNew && (
      <div className="card" style={{ borderLeft: '4px solid var(--brand)' }}>
        <h2>Add learner</h2>
        <div className="row">
          <div><label>Full name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label>Email (login)</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label>Branch</label>
            <select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
              <option value="">Default</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn" onClick={create} disabled={!f.name || !f.email}>Create learner</button>
        <span className="muted" style={{ marginLeft: 10, fontSize: '.8rem' }}>Login details are emailed and shown once so you can share them.</span>
      </div>
    )}

    <div className="card">
      <div className="filterbar">
        <input className="grow" placeholder="🔍  Search name / email / phone…  (press Enter)" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1))} />
        <GeoFilter value={geo} onChange={setGeo} />
        <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
          {LIFECYCLES.map((l) => <option key={l} value={l}>{l || 'All stages'}</option>)}
        </select>
        <button className="btn" onClick={() => { setPage(1); load(1); }}>Search</button>
        <span className="chip">{total} learners</span>
      </div>
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="🧑‍🎓" text="No learners match these filters" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Branch</th><th>Stage</th><th>Account</th><th></th></tr></thead>
          <tbody>{rows.map((l) => {
            const b = bInfo(l.branchId);
            return (
              <tr key={l.id} style={l.isActive === false ? { opacity: .6 } : undefined}>
                <td><Link href={`/admin/learners/${l.id}`}><b>{l.name}</b></Link></td>
                <td>{l.email}<br /><span className="muted">{l.phone ?? '—'}</span></td>
                <td>{b ? <>{b.name}<br /><span className="muted" style={{ fontSize: '.78rem' }}>{b.city}, {b.state}</span></> : '—'}</td>
                <td><span className={`badge ${l.lifecycle === 'ACTIVE' ? 'green' : l.lifecycle === 'DROPPED' ? 'red' : l.lifecycle === 'COMPLETED' ? 'blue' : 'gray'}`}>{l.lifecycle ?? '—'}</span></td>
                <td>
                  {l.isActive === false ? <span className="badge red">Deactivated</span>
                    : l.mustChangePassword ? <span className="badge amber">Not logged in yet</span>
                    : <span className="badge green">Active</span>}
                </td>
                <td><div className="actions" style={{ gap: 6 }}>
                  <Link className="btn btn-ghost btn-sm" href={`/admin/learners/${l.id}`}>Open</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => reset(l)}>🔄 Reset password</button>
                </div></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {pages > 1 && (
        <div className="actions" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1); }}>← Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => { setPage(page + 1); load(page + 1); }}>Next →</button>
        </div>
      )}
    </div>
  </>);
}
