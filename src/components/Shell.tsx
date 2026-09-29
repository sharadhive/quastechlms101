'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { clearMe, useMe } from '@/lib/client/useMe';

export interface NavItem { href: string; label: string; icon?: keyof typeof I; }
export interface NavGroup { title?: string; items: NavItem[]; superAdminOnly?: boolean; }

export const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.5 14.6c2.9.1 5 1.5 5.8 4.4"/></svg>,
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>,
  layers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>,
  cash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-11 11M22 2 15 22l-4-9-9-4z"/></svg>,
  flag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 21V4c4-2.5 8 2.5 13 0v10c-5 2.5-9-2.5-13 0"/></svg>,
  pin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>,
  clip: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0M9 10h6M9 14h6"/></svg>,
  video: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5z"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9.5"/><path d="M12 8v8M8 12h8"/></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M10 20.5a2.3 2.3 0 0 0 4 0"/></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10.5h18"/></svg>,
  cert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="9" r="5.5"/><path d="m8.8 13.5-1.6 7 4.8-2.6 4.8 2.6-1.6-7"/></svg>,
  plug: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  play: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9.5"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z"/><path d="m9 12 2 2 4-4"/></svg>,
};

export default function Shell({
  title, nav, groups, children,
}: { title: string; nav?: NavItem[]; groups?: NavGroup[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [who, setWho] = useState({ name: '', role: '' });
  const me = useMe();
  useEffect(() => {
    setWho({ name: localStorage.getItem('qs_name') ?? '', role: (localStorage.getItem('qs_role') ?? '').replace('_', ' ').toLowerCase() });
  }, []);
  // The server is the source of truth: show the signed-in user's real name/role
  // even when localStorage is empty or stale (new tab, cleared storage, another account).
  useEffect(() => {
    if (!me?.user) return;
    try {
      localStorage.setItem('qs_name', me.user.name ?? '');
      localStorage.setItem('qs_role', me.user.role);
    } catch { /* storage unavailable */ }
    setWho({ name: me.user.name ?? '', role: me.user.role.replace('_', ' ').toLowerCase() });
  }, [me]);
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); localStorage.clear(); clearMe(); router.push('/login'); };
  // A nav item stays highlighted on its sub-pages too (e.g. Courses → a course builder)
  const isActive = (href: string) =>
    pathname === href || (!['/admin', '/instructor', '/app'].includes(href) && pathname.startsWith(href + '/'));

  // ── Global search (role-aware) ──
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      api(`/api/search?q=${encodeURIComponent(q)}`).then((d) => { setHits(d.hits); setOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  const isSuper = who.role.replace(' ', '_').toUpperCase() === 'SUPER_ADMIN';
  const allGroups: NavGroup[] = (groups ?? [{ items: nav ?? [] }]).filter((g) => !g.superAdminOnly || isSuper);
  const initials = (who.name || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><img src="/logo.png" alt="QUASTECH" style={{ height: 30 }} /> LMS</div>
        {allGroups.map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="group">{g.title}</div>}
            {g.items.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>
                {n.icon && I[n.icon]} {n.label}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <div className="main">
        <div className="topbar">
          <h1>{title}</h1>
          <div className="searchbox">
            <input
              placeholder="🔍  Search anything…  (learners, courses, batches)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => hits.length && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 180)}
            />
            {open && hits.length > 0 && (
              <div className="searchresults">
                {hits.map((h, i) => (
                  <div key={i} className="hit" onMouseDown={() => go(h.href)}>
                    <span className="ic">{h.icon}</span>
                    <div>
                      <b>{h.label}</b>
                      <span className="muted"> · {h.type}{h.sub ? ` · ${h.sub}` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {open && q.length >= 2 && hits.length === 0 && (
              <div className="searchresults"><div className="hit muted">No matches for “{q}”</div></div>
            )}
          </div>
          <div className="who">
            <div className="avatar">{initials}</div>
            <div className="meta"><b>{who.name || 'User'}</b><span>{who.role}</span></div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
