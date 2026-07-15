'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export default function Notifications() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api('/api/notifications').then((d) => setRows(d.notifications));
  useEffect(() => { load(); }, []);
  const markAll = async () => {
    const unread = rows.filter((n) => !n.readAt).map((n) => n.id);
    if (unread.length) { await api('/api/notifications', { method: 'PATCH', json: { ids: unread } }); load(); }
  };
  return (
    <div className="card">
      <button className="btn btn-ghost btn-sm" onClick={markAll}>Mark all read</button>
      {rows.map((n) => (
        <p key={n.id} style={{ opacity: n.readAt ? 0.6 : 1 }}>
          <b>{n.title}</b> — <span className="muted">{n.body}</span>
          {!n.readAt && <span className="badge amber" style={{ marginLeft: 8 }}>new</span>}
          <br /><span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
        </p>
      ))}
      {rows.length === 0 && <p className="muted">Nothing yet.</p>}
    </div>
  );
}
