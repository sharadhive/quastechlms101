'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { SkelRows, Empty } from '@/components/ui';

export default function Integrations() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [openProv, setOpenProv] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);   // integration id being edited
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<{ id: string; rows: any[] } | null>(null);

  const load = () => api('/api/integrations').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err) return <div className="card err">{err}<p className="muted">Only the Super Admin can manage integrations.</p></div>;
  if (!d) return <div className="card"><SkelRows n={4} /></div>;

  const saved = (p: string) => d.integrations.filter((i: any) => i.provider === p);
  const activeOf = (p: string) => saved(p).find((i: any) => i.isActive);

  const startNew = (prov: any) => {
    setOpenProv(prov.provider); setEditing(null); setMsg(null);
    setName(`${prov.name} — ${new Date().toLocaleDateString()}`);
    const init: Record<string, any> = {};
    for (const f of prov.fields) if (f.default !== undefined) init[f.key] = f.default;
    setForm(init);
  };
  const startEdit = (prov: any, integ: any) => {
    setOpenProv(prov.provider); setEditing(integ.id); setMsg(null);
    setName(integ.name); setForm({ ...(integ.config ?? {}) });   // secrets stay blank = unchanged
  };

  const save = async (prov: any, activate: boolean) => {
    setBusy('save'); setMsg(null);
    try {
      if (editing) {
        await api(`/api/integrations/${editing}`, { method: 'PATCH', json: { name, values: form, ...(activate ? { isActive: true } : {}) } });
      } else {
        await api('/api/integrations', { method: 'POST', json: { provider: prov.provider, name, values: form, activate } });
      }
      setOpenProv(null); setEditing(null); setForm({});
      await load();
    } catch (e: any) { setMsg({ id: 'form', ok: false, text: e.message }); }
    finally { setBusy(''); }
  };

  const test = async (id: string) => {
    setBusy(`t:${id}`); setMsg(null);
    try {
      const r = await api(`/api/integrations/${id}/test`, { method: 'POST' });
      setMsg({ id, ok: r.ok, text: r.message });
      await load();
    } catch (e: any) { setMsg({ id, ok: false, text: e.message }); }
    finally { setBusy(''); }
  };
  const activate = async (id: string, on: boolean) => { await api(`/api/integrations/${id}`, { method: 'PATCH', json: { isActive: on } }); load(); };
  const openHistory = async (id: string) => {
    const r = await api(`/api/integrations/${id}/history`);
    setHistory({ id, rows: r.history });
  };
  const restore = async (hid: string) => {
    if (!confirm('Bring back this older configuration? It becomes the current one (the present version is kept in history).')) return;
    await api(`/api/integrations/history/${hid}/restore`, { method: 'POST' });
    setHistory(null); load();
  };

  const cats = [...new Set(d.providers.map((p: any) => p.category))] as string[];

  return (<>
    <div className="card">
      <h2>🔌 Integrations &amp; credentials</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Connect the outside services this platform uses — email, WhatsApp, payments, meetings, storage.
        Credentials are <b>encrypted</b> before they are stored, are never shown again in full, and
        <b> every change is kept in history</b>, so an old configuration can be restored at any time.
      </p>
      <div className="stepper">
        <span className="step">1 · Set up</span>
        <span className="step">2 · Test connection</span>
        <span className="step">3 · Activate</span>
        <span className="step">4 · Change anytime — history keeps the old one</span>
      </div>
    </div>

    {cats.map((cat) => (
      <div key={cat}>
        <div className="group" style={{ color: 'var(--muted)', fontWeight: 700, fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', padding: '10px 2px 6px' }}>{cat}</div>

        {d.providers.filter((p: any) => p.category === cat).map((prov: any) => {
          const list = saved(prov.provider);
          const act = activeOf(prov.provider);
          const envFb = d.envFallback?.[prov.provider];
          return (
            <div className="card" key={prov.provider}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '1.6rem' }}>{prov.icon}</div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <b>{prov.name}</b>{' '}
                  {act ? <span className="badge green">● Active — {act.name}</span>
                    : list.length ? <span className="badge amber">Configured, not active</span>
                    : envFb ? <span className="badge blue">Using .env file</span>
                    : <span className="badge gray">Not set up</span>}
                  <p className="muted" style={{ margin: '4px 0 0' }}>{prov.summary}</p>
                  {act?.status === 'FAILED' && <div className="err">Last test failed: {act.lastError}</div>}
                  {act?.status === 'OK' && <div className="muted">✅ Tested successfully on {new Date(act.lastTestedAt).toLocaleString()}</div>}
                </div>
                <button className="btn btn-sm" onClick={() => startNew(prov)}>+ New configuration</button>
              </div>

              {/* first-time guidance */}
              {list.length === 0 && (
                <div style={{ background: 'var(--brand-50)', borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
                  <b style={{ fontSize: '.82rem' }}>How to set this up</b>
                  <ol style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '.83rem', color: 'var(--muted)' }}>
                    {prov.setupSteps.map((s: string, i: number) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
                  </ol>
                  {prov.docsUrl && <a href={prov.docsUrl} target="_blank" style={{ fontSize: '.82rem' }}>Open provider dashboard ↗</a>}
                </div>
              )}

              {/* saved configurations */}
              {list.length > 0 && (
                <div className="tablewrap" style={{ marginTop: 10 }}><table>
                  <thead><tr><th>Configuration</th><th>Details</th><th>Status</th><th>Version</th><th></th></tr></thead>
                  <tbody>{list.map((i: any) => (
                    <tr key={i.id}>
                      <td><b>{i.name}</b>{i.isActive && <span className="badge green" style={{ marginLeft: 6 }}>live</span>}</td>
                      <td className="muted">
                        {Object.entries(i.config ?? {}).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        {Object.entries(i.maskedSecrets ?? {}).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
                      </td>
                      <td>
                        {i.status === 'OK' ? <span className="badge green">tested ✓</span>
                          : i.status === 'FAILED' ? <span className="badge red">failed</span>
                          : <span className="badge gray">untested</span>}
                      </td>
                      <td className="muted">v{i.version}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {prov.testable && <button className="btn btn-ghost btn-sm" disabled={busy === `t:${i.id}`} onClick={() => test(i.id)}>
                          {busy === `t:${i.id}` ? 'Testing…' : 'Test'}
                        </button>}{' '}
                        {i.isActive
                          ? <button className="btn btn-ghost btn-sm" onClick={() => activate(i.id, false)}>Deactivate</button>
                          : <button className="btn btn-sm" onClick={() => activate(i.id, true)}>Activate</button>}{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(prov, i)}>Edit</button>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => openHistory(i.id)}>History</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
              {msg && list.some((i: any) => i.id === msg.id) && (
                <div className={msg.ok ? 'ok' : 'err'}>{msg.ok ? '✅ ' : '⚠ '}{msg.text}</div>
              )}

              {/* setup / edit form */}
              {openProv === prov.provider && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                  <h2>{editing ? 'Edit configuration' : `Set up ${prov.name}`}</h2>
                  <div><label>Configuration name (for your reference)</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gmail — office account" /></div>
                  {prov.fields.map((f: any) => (
                    <div key={f.key}>
                      <label>{f.label}{f.required && ' *'}{f.secret && ' 🔒'}</label>
                      {f.type === 'select' ? (
                        <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                          <option value="">Select…</option>
                          {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea rows={4} placeholder={f.placeholder} value={form[f.key] ?? ''}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                      ) : (
                        <input type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                          placeholder={editing && f.secret ? 'Leave blank to keep the current secret' : f.placeholder}
                          value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                      )}
                      {f.help && <p className="muted" style={{ margin: '-8px 0 10px', fontSize: '.78rem' }}>💡 {f.help}</p>}
                    </div>
                  ))}
                  {msg?.id === 'form' && <div className="err">{msg.text}</div>}
                  <button className="btn" disabled={busy === 'save' || !name} onClick={() => save(prov, false)}>
                    {busy === 'save' ? 'Saving…' : 'Save'}
                  </button>{' '}
                  <button className="btn btn-ghost" disabled={busy === 'save'} onClick={() => save(prov, true)}>Save &amp; activate</button>{' '}
                  <button className="btn btn-ghost" onClick={() => { setOpenProv(null); setEditing(null); }}>Cancel</button>
                  <p className="muted" style={{ marginTop: 8 }}>🔒 Secrets are encrypted before saving and can never be read back — only replaced.</p>
                </div>
              )}

              {/* history drawer */}
              {history && list.some((i: any) => i.id === history.id) && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h2>🕘 Change history</h2>
                    <button className="btn btn-ghost btn-sm" onClick={() => setHistory(null)}>Close</button>
                  </div>
                  {history.rows.length === 0 ? <Empty icon="🕘" text="No history yet" /> : (
                    <div className="tablewrap"><table>
                      <thead><tr><th>When</th><th>Action</th><th>Name</th><th>By</th><th></th></tr></thead>
                      <tbody>{history.rows.map((h: any) => (
                        <tr key={h.id}>
                          <td className="muted">{new Date(h.changedAt).toLocaleString()}</td>
                          <td><span className="badge blue">{h.action}</span></td>
                          <td>{h.name}</td>
                          <td className="muted">{h.changedBy}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => restore(h.id)}>Use this version again</button></td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    ))}
  </>);
}
