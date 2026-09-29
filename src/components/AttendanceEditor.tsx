'use client';
import { useEffect, useState } from 'react';

export interface RosterRow { id: string; name: string; email?: string | null; present: boolean | null }

/** Present / Absent list — tap a student (or the buttons) to switch. Unmarked students start as Present. */
export function AttendanceList({ rows, onChange }: { rows: { id: string; name: string; email?: string | null; present: boolean }[]; onChange: (rows: any[]) => void }) {
  const set = (id: string, present: boolean) => onChange(rows.map((r) => (r.id === id ? { ...r, present } : r)));
  const presentCount = rows.filter((r) => r.present).length;
  if (rows.length === 0) return <p className="muted">No students in this batch yet.</p>;
  return (<>
    <div className="actions">
      <b style={{ fontSize: '.9rem' }}>{presentCount} of {rows.length} present</b>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(rows.map((r) => ({ ...r, present: true })))}>Everyone present</button>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(rows.map((r) => ({ ...r, present: false })))}>Everyone absent</button>
    </div>
    <div className="att-list">
      {rows.map((r, i) => (
        <div key={r.id} className={`att-row ${r.present ? 'present' : 'absent'}`} onClick={() => set(r.id, !r.present)}>
          <span className="muted" style={{ fontSize: '.78rem', minWidth: 18 }}>{i + 1}.</span>
          <div className="who"><b>{r.name}</b>{r.email && <small>{r.email}</small>}</div>
          <div className="seg" onClick={(e) => e.stopPropagation()}>
            <button className={`p ${r.present ? 'on' : ''}`} onClick={() => set(r.id, true)}>Present</button>
            <button className={`a ${!r.present ? 'on' : ''}`} onClick={() => set(r.id, false)}>Absent</button>
          </div>
        </div>
      ))}
    </div>
  </>);
}

/** Loads a roster, lets the instructor change marks, saves. Used for topics and for past classes. */
export default function AttendanceEditor({ title, load, save, onClose, onSaved }: {
  title: string;
  load: () => Promise<{ roster: RosterRow[] }>;
  save: (marks: { learnerId: string; present: boolean }[]) => Promise<any>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    load().then((d) => setRows(d.roster.map((r) => ({ ...r, present: r.present ?? true })))).catch((e) => setErr(e.message));
  }, []);
  const submit = async () => {
    setSaving(true); setErr('');
    try {
      await save(rows!.map((r) => ({ learnerId: r.id, present: r.present })));
      onSaved(`Attendance saved ✓ — ${rows!.filter((r) => r.present).length} of ${rows!.length} present`);
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="att-editor">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b>✋ Attendance — {title}</b>
        <button className="iconbtn" title="Close" onClick={onClose}>✕</button>
      </div>
      {rows === null && !err && <p className="muted">Loading students…</p>}
      {rows && <AttendanceList rows={rows} onChange={setRows} />}
      {err && <div className="err">{err}</div>}
      {rows && rows.length > 0 && (
        <div className="actions">
          <button className="btn" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save attendance'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      )}
    </div>
  );
}
