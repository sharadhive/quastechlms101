'use client';
/** Reschedule / cancel / clash handling for class sessions — shared by the admin and instructor batch pages. */
import { useState } from 'react';
import { api } from '@/lib/client/api';

/** value for <input type="datetime-local"> in the user's own time */
export const toLocalInput = (d: string | Date) => {
  const x = new Date(d);
  x.setSeconds(0, 0);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};
export const fmtWhen = (d: string | Date) =>
  new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Send once; if the server says another class is less than an hour away (code SCHEDULE_CONFLICT),
 * ask the user and send again with force. Returns null when the user says no.
 */
export async function withClashCheck<T>(send: (force: boolean) => Promise<T>): Promise<T | null> {
  try {
    return await send(false);
  } catch (e: any) {
    if (e?.code !== 'SCHEDULE_CONFLICT') throw e;
    if (!window.confirm(`${e.message}\n\nKeep this time anyway?`)) return null;
    return await send(true);
  }
}

/** Ask for an optional reason, cancel the class, report how many people were told. */
export async function cancelSession(s: { id: string; title: string; scheduledAt: string }, done: (m: string) => void, fail: (m: string) => void) {
  const reason = window.prompt(
    `Cancel “${s.title}” on ${fmtWhen(s.scheduledAt)}?\n\nStudents get a notification and an email.\nReason (optional):`, '');
  if (reason === null) return;
  try {
    const r = await api(`/api/sessions/${s.id}`, { method: 'DELETE', json: { reason: reason.trim() || undefined } });
    done(`“${s.title}” cancelled${r.notified ? ` — ${r.notified} ${r.notified === 1 ? 'person' : 'people'} notified` : ''}.`);
  } catch (e: any) { fail(e.message); }
}

export function RescheduleForm({ s, onSaved, onError, onClose }: {
  s: { id: string; title: string; scheduledAt: string };
  onSaved: (m: string) => void;
  onError: (m: string) => void;
  onClose: () => void;
}) {
  const [at, setAt] = useState(toLocalInput(s.scheduledAt));
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const changed = !!at && new Date(at).getTime() !== new Date(toLocalInput(s.scheduledAt)).getTime();
  const past = !!at && new Date(at).getTime() < Date.now() - 5 * 60_000;

  const save = async () => {
    setBusy(true);
    try {
      const r = await withClashCheck((force) => api(`/api/sessions/${s.id}`, {
        method: 'PATCH',
        json: { scheduledAt: new Date(at).toISOString(), reason: reason.trim() || undefined, notifyStudents: notify, ...(force ? { force: true } : {}) },
      }));
      if (r) onSaved(`“${s.title}” moved to ${fmtWhen(at)} ✓ — ${r.notified ? `${r.notified} ${r.notified === 1 ? 'person' : 'people'} notified, ` : ''}reminders updated.`);
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="panel-inline" style={{ margin: '8px 0 0' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <label>New date &amp; time</label>
          <input type="datetime-local" value={at} min={toLocalInput(new Date())} onChange={(e) => setAt(e.target.value)} />
        </div>
        <div style={{ minWidth: 220 }}>
          <label>Reason (optional — shown to students)</label>
          <input value={reason} maxLength={300} placeholder="e.g. Trainer is unwell" onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, marginBottom: 8 }}>
        <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Tell the students (panel notification + email)
      </label>
      {past && <div className="err" style={{ marginTop: 0 }}>That time is in the past.</div>}
      <div className="actions">
        <button className="btn btn-sm" disabled={!changed || past || busy} onClick={save}>{busy ? 'Saving…' : 'Move class'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </div>
  );
}
