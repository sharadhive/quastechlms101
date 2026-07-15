'use client';
import { useEffect, useState } from 'react';

/** Tiny SVG sparkline for KPI cards. */
export function Spark({ data, color = 'var(--brand)', w = 84, h = 30 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Area chart with axis labels — the Edmingle-style enrollments graph. */
export function AreaChart({ data, labels, height = 220 }: { data: number[]; labels: string[]; height?: number }) {
  const w = 900, h = height, padL = 34, padB = 24, padT = 12;
  const max = Math.max(...data, 4);
  const iw = w - padL - 8, ih = h - padB - padT;
  const x = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * iw;
  const y = (v: number) => padT + ih - (v / max) * ih;
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${padL},${padT + ih} ${line} ${x(data.length - 1)},${padT + ih}`;
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="areagrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridYs.map((gv) => (
        <g key={gv}>
          <line x1={padL} x2={w - 8} y1={y(gv)} y2={y(gv)} stroke="var(--border)" strokeDasharray="3 4" />
          <text x={padL - 6} y={y(gv) + 4} textAnchor="end" className="chart-tip">{gv}</text>
        </g>
      ))}
      <polygon points={area} fill="url(#areagrad)" />
      <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={v > 0 ? 3 : 0} fill="#fff" stroke="var(--brand)" strokeWidth="2">
          <title>{labels[i]}: {v}</title>
        </circle>
      ))}
      {labels.map((l, i) =>
        i % Math.ceil(labels.length / 8) === 0 ? (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle" className="chart-tip">{l}</text>
        ) : null,
      )}
    </svg>
  );
}

export function Kpi({ label, value, spark, delta }: { label: string; value: string | number; spark?: number[]; delta?: number }) {
  return (
    <div className="card kpi">
      <div className="lbl">{label}</div>
      <div className="num">{value}</div>
      {typeof delta === 'number' && (
        <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>
      )}
      {spark && <Spark data={spark} />}
    </div>
  );
}

export function Empty({ icon = '📭', text }: { icon?: string; text: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div>{text}</div>
    </div>
  );
}

export function SkelRows({ n = 4 }: { n?: number }) {
  return (
    <div>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skel" style={{ height: 40, marginBottom: 8 }} />
      ))}
    </div>
  );
}

const PALETTE = ['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#84CC16'];

/** Donut / pie chart with center total and legend. */
export function Donut({ data, size = 170, thickness = 30, center }:
  { data: { label: string; value: number }[]; size?: number; thickness?: number; center?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${c} ${c})`}>
          {total === 0 && <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />}
          {data.map((d, i) => {
            const len = total ? (d.value / total) * circ : 0;
            const el = (
              <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={thickness} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}>
                <title>{d.label}: {d.value}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={c} y={c - 2} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text)">{center ?? total}</text>
        <text x={c} y={c + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">TOTAL</text>
      </svg>
      <div>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', marginBottom: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
            <span style={{ flex: 1 }}>{d.label}</span>
            <b>{d.value}</b>
            <span className="muted">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
        {data.length === 0 && <span className="muted">No data yet</span>}
      </div>
    </div>
  );
}

/** Vertical bar chart with value labels. */
export function Bars({ data, height = 190, money = false }:
  { data: { label: string; value: number }[]; height?: number; money?: boolean }) {
  const w = 620, padB = 30, padT = 20, padL = 8;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = data.length ? (w - padL * 2) / data.length : 0;
  const fmt = (v: number) => (money ? `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}` : String(v));
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - padB - padT);
        const x = padL + i * bw + bw * 0.18, bwidth = bw * 0.64;
        return (
          <g key={i}>
            <rect x={x} y={height - padB - h} width={bwidth} height={Math.max(h, 2)} rx="6" fill={PALETTE[i % PALETTE.length]} opacity="0.9">
              <title>{d.label}: {fmt(d.value)}</title>
            </rect>
            <text x={x + bwidth / 2} y={height - padB - h - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">{fmt(d.value)}</text>
            <text x={x + bwidth / 2} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label}
            </text>
          </g>
        );
      })}
      {data.length === 0 && <text x={w / 2} y={height / 2} textAnchor="middle" fill="var(--faint)" fontSize="12">No data yet</text>}
    </svg>
  );
}

/** Horizontal ranked bars — good for "top courses". */
export function HBars({ data, money = false }: { data: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginBottom: 3 }}>
            <span>{d.label}</span>
            <b>{money ? `₹${Number(d.value).toLocaleString('en-IN')}` : d.value}</b>
          </div>
          <div style={{ height: 9, background: '#eef0f5', borderRadius: 99 }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', borderRadius: 99,
              background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}, ${PALETTE[(i + 1) % PALETTE.length]})` }} />
          </div>
        </div>
      ))}
      {data.length === 0 && <span className="muted">No data yet</span>}
    </div>
  );
}

/** Radial progress ring (course completion, attendance %). */
export function Radial({ pct, label, size = 116, color = '#7C3AED' }:
  { pct: number; label?: string; size?: number; color?: string }) {
  const r = size / 2 - 9, c = size / 2, circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef0f5" strokeWidth="9" />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />
        <text x={c} y={c + 6} textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--text)">{Math.round(v)}%</text>
      </svg>
      {label && <div className="muted" style={{ marginTop: 2 }}>{label}</div>}
    </div>
  );
}

/** Funnel — enquiry → enrolled → active → completed. */
export function Funnel({ stages }: { stages: { label: string; value: number }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div>
      {stages.map((s, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 3 }}>
            <span>{s.label}</span><b>{s.value}</b>
          </div>
          <div style={{ height: 26, borderRadius: 8, width: `${Math.max((s.value / max) * 100, 6)}%`,
            background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}, ${PALETTE[(i + 2) % PALETTE.length]})`,
            display: 'flex', alignItems: 'center', paddingLeft: 10, color: '#fff', fontSize: '.75rem', fontWeight: 700 }}>
            {i > 0 && stages[i - 1].value > 0 ? `${Math.round((s.value / stages[i - 1].value) * 100)}%` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Activity heatmap — last 8 weeks (GitHub-style). */
export function HeatMap({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const cell = 13, gap = 3;
  const weeks = Math.ceil(days.length / 7);
  return (
    <svg width="100%" viewBox={`0 0 ${weeks * (cell + gap)} ${7 * (cell + gap)}`} style={{ maxWidth: weeks * (cell + gap) }}>
      {days.map((d, i) => {
        const wk = Math.floor(i / 7), dy = i % 7;
        const intensity = d.count === 0 ? 0 : 0.25 + (d.count / max) * 0.75;
        return (
          <rect key={i} x={wk * (cell + gap)} y={dy * (cell + gap)} width={cell} height={cell} rx="3"
            fill={d.count === 0 ? '#eef0f5' : '#7C3AED'} opacity={d.count === 0 ? 1 : intensity}>
            <title>{d.date}: {d.count} activities</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Cascading State → City → Branch filter. Fully dependent: city list narrows by state, branch list by city. */
export function GeoFilter({ value, onChange, compact = false }: {
  value: { state: string; city: string; branchId: string };
  onChange: (v: { state: string; city: string; branchId: string }) => void;
  compact?: boolean;
}) {
  const [tree, setTree] = useState<Record<string, Record<string, { id: string; name: string }[]>>>({});
  const [locked, setLocked] = useState(false); // branch admins see a single fixed branch

  useEffect(() => {
    import('@/lib/client/api').then(({ api }) =>
      api('/api/branches').then((d: any) => {
        setTree(d.geoTree ?? {});
        if ((d.branches ?? []).length === 1 && Object.keys(d.geoTree ?? {}).length === 1) setLocked(true);
      }).catch(() => {}),
    );
  }, []);

  const states = Object.keys(tree).sort();
  const cities = value.state ? Object.keys(tree[value.state] ?? {}).sort() : [...new Set(states.flatMap((s) => Object.keys(tree[s])))].sort();
  const branches = value.state && value.city
    ? tree[value.state]?.[value.city] ?? []
    : value.state
      ? Object.values(tree[value.state] ?? {}).flat()
      : states.flatMap((s) => Object.values(tree[s]).flat());

  return (
    <>
      <select value={value.state} disabled={locked}
        onChange={(e) => onChange({ state: e.target.value, city: '', branchId: '' })}>
        <option value="">{compact ? 'State' : 'All states'}</option>
        {states.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={value.city} disabled={locked}
        onChange={(e) => onChange({ ...value, city: e.target.value, branchId: '' })}>
        <option value="">{compact ? 'City' : 'All cities'}</option>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={value.branchId} disabled={locked}
        onChange={(e) => onChange({ ...value, branchId: e.target.value })}>
        <option value="">{compact ? 'Branch' : 'All branches'}</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {(value.state || value.city || value.branchId) && !locked && (
        <button className="btn btn-ghost btn-sm" onClick={() => onChange({ state: '', city: '', branchId: '' })}>Clear</button>
      )}
    </>
  );
}

/** Builds the ?state=&city=&branchId= query string from a geo value. */
export function geoQuery(v: { state: string; city: string; branchId: string }, extra?: Record<string, string>) {
  const p = new URLSearchParams();
  if (v.state) p.set('state', v.state);
  if (v.city) p.set('city', v.city);
  if (v.branchId) p.set('branchId', v.branchId);
  for (const [k, val] of Object.entries(extra ?? {})) if (val) p.set(k, val);
  return p.toString();
}
