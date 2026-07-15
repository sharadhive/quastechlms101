'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Empty, SkelRows, GeoFilter, geoQuery } from '@/components/ui';

const LIFECYCLES = ['', 'LEAD', 'ENQUIRY', 'ENROLLED', 'ACTIVE', 'COMPLETED', 'DROPPED'];

export default function Learners() {
  const [q, setQ] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [geo, setGeo] = useState({ state: '', city: '', branchId: '' });
  const [branches, setBranches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');

  const load = () => {
    setRows(null);
    return api(`/api/learners?${geoQuery(geo, { q, lifecycle })}`)
      .then((d) => { setRows(d.learners); setTotal(d.total); });
  };
  useEffect(() => { api('/api/branches').then((d) => setBranches(d.branches)); }, []);
  useEffect(() => { load(); }, [geo.state, geo.city, geo.branchId, lifecycle]);

  const bInfo = (id: string) => branches.find((b) => b.id === id);

  const create = async () => {
    setErr(''); setMsg('');
    try {
      const d = await api('/api/learners', { method: 'POST', json: { ...f, phone: f.phone || undefined } });
      setMsg(`Created. Temp password: ${d.tempPassword}`); setF({ name: '', email: '', phone: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };

  return (<>
    <div className="card">
      <div className="filterbar">
        <input className="grow" placeholder="🔍  Search name / email / phone…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <GeoFilter value={geo} onChange={setGeo} />
        <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
          {LIFECYCLES.map((l) => <option key={l} value={l}>{l || 'All lifecycles'}</option>)}
        </select>
        <button className="btn" onClick={load}>Search</button>
        <span className="chip">{total} learners</span>
      </div>
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="🧑‍🎓" text="No learners match these filters" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Branch</th><th>City / State</th><th>Lifecycle</th><th></th></tr></thead>
          <tbody>{rows.map((l) => {
            const b = bInfo(l.branchId);
            return (
              <tr key={l.id}>
                <td><b>{l.name}</b></td>
                <td>{l.email}<br /><span className="muted">{l.phone ?? '—'}</span></td>
                <td>{b?.name ?? '—'}</td>
                <td>{b ? <span className="badge blue">{b.city}, {b.state}</span> : '—'}</td>
                <td><span className={`badge ${l.lifecycle === 'ACTIVE' ? 'green' : l.lifecycle === 'DROPPED' ? 'red' : 'gray'}`}>{l.lifecycle ?? '—'}</span></td>
                <td><Link href={`/admin/learners/${l.id}`}>View →</Link></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>

    <div className="card">
      <h2>Quick add learner</h2>
      <div className="row">
        <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      {err && <div className="err">{err}</div>}{msg && <div className="ok">{msg}</div>}
      <button className="btn" onClick={create} disabled={!f.name || !f.email}>Create learner</button>
    </div>
  </>);
}
