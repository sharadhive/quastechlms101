'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Empty, SkelRows } from '@/components/ui';

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya',
  'Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Chandigarh','Jammu & Kashmir','Ladakh','Puducherry',
];

export default function Branches() {
  const [branches, setBranches] = useState<any[] | null>(null);
  const [f, setF] = useState({ name: '', city: '', state: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [filterState, setFilterState] = useState('');

  const load = () => api('/api/branches').then((d) => setBranches(d.branches));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr(''); setOk('');
    try {
      await api('/api/branches', { method: 'POST', json: f });
      setOk(`Branch “${f.name}” created in ${f.city}, ${f.state}`);
      setF({ name: '', city: '', state: '' }); load();
    } catch (e: any) { setErr(e.message); }
  };

  const knownCities = [...new Set((branches ?? []).map((b) => b.city))];
  const rows = (branches ?? []).filter((b) => !filterState || b.state === filterState);
  const byState: Record<string, any[]> = {};
  for (const b of rows) (byState[b.state] ??= []).push(b);

  return (<>
    <div className="card">
      <h2>🏢 Add branch</h2>
      <div className="row">
        <div><label>Branch name</label>
          <input placeholder="e.g. Thane Center" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label>State</label>
          <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
            <option value="">Select state…</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label>City</label>
          <input list="cities" placeholder="e.g. Thane" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          <datalist id="cities">{knownCities.map((c) => <option key={c} value={c} />)}</datalist></div>
      </div>
      {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
      <button className="btn" onClick={create} disabled={!f.name || !f.city || !f.state}>Create branch</button>
    </div>

    <div className="card">
      <div className="filterbar">
        <select value={filterState} onChange={(e) => setFilterState(e.target.value)}>
          <option value="">All states</option>
          {[...new Set((branches ?? []).map((b) => b.state))].sort().map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="chip">{rows.length} branches · {new Set(rows.map((b) => b.city)).size} cities · {Object.keys(byState).length} states</span>
      </div>
      {branches === null ? <SkelRows /> : rows.length === 0 ? <Empty icon="🏢" text="No branches yet" /> : (
        Object.entries(byState).sort().map(([state, list]) => (
          <div key={state} style={{ marginBottom: 14 }}>
            <div className="group" style={{ color: 'var(--muted)', padding: '4px 0 6px', fontWeight: 700, fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>
              📍 {state}
            </div>
            <div className="tablewrap"><table>
              <thead><tr><th>Branch</th><th>City</th><th>Users</th><th>Batches</th><th>Created</th></tr></thead>
              <tbody>{list.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b></td>
                  <td><span className="badge blue">{b.city}</span></td>
                  <td>{b._count?.users ?? 0}</td>
                  <td>{b._count?.batches ?? 0}</td>
                  <td className="muted">{new Date(b.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        ))
      )}
    </div>
  </>);
}
