'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars">
      {[1,2,3,4,5].map((i) => <span key={i} className={i <= Math.round(rating) ? '' : 'empty'}>★</span>)}
    </span>
  );
}

export default function ExploreCourses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [priceType, setPriceType] = useState(''); // '' | 'free' | 'paid'
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (priceType) params.set('priceType', priceType);
      params.set('sort', sort);
      params.set('page', String(page));
      params.set('pageSize', '20');

      const data = await api(`/api/catalog?${params}`);
      setCourses(data.courses ?? []);
      setTotal(data.total ?? 0);
      if (data.categories) setCategories(data.categories);
    } catch {}
    setLoading(false);
  }, [q, category, priceType, sort, page]);

  // Load enrolled courses for "already enrolled" badges
  useEffect(() => {
    api('/api/me/courses').then((d) => {
      const ids = new Set((d.enrollments ?? []).map((e: any) => e.courseId ?? e.course?.id));
      setEnrolled(ids as Set<string>);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  const [searchTimer, setSearchTimer] = useState<any>(null);
  const onSearch = (val: string) => {
    setQ(val);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => { setPage(1); }, 400));
  };

  return (<>
    <h1 style={{ marginBottom: 16 }}>🔍 Explore Courses</h1>

    {/* Smart Filters */}
    <div className="explore-filters">
      <input className="search-input" placeholder="Search courses…" value={q}
        onChange={(e) => onSearch(e.target.value)} />
      <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
        <option value="">All Categories</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
        <option value="newest">Newest First</option>
        <option value="popular">Most Popular</option>
        <option value="price_asc">Price: Low → High</option>
        <option value="price_desc">Price: High → Low</option>
      </select>
    </div>

    {/* Price Filter Chips */}
    <div className="filter-chips" style={{ marginBottom: 16 }}>
      <button className={`filter-chip${priceType === '' ? ' active' : ''}`}
        onClick={() => { setPriceType(''); setPage(1); }}>All Courses</button>
      <button className={`filter-chip${priceType === 'free' ? ' active' : ''}`}
        onClick={() => { setPriceType('free'); setPage(1); }}>🆓 Free</button>
      <button className={`filter-chip${priceType === 'paid' ? ' active' : ''}`}
        onClick={() => { setPriceType('paid'); setPage(1); }}>💎 Paid</button>
      <span className="muted" style={{ marginLeft: 8 }}>{total} course{total !== 1 ? 's' : ''} found</span>
    </div>

    {/* Course Grid */}
    {loading ? (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div className="muted">Loading courses…</div>
      </div>
    ) : courses.length === 0 ? (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
        <div className="muted">No courses found. Try adjusting your filters.</div>
      </div>
    ) : (
      <div className="course-grid">
        {courses.map((c) => {
          const isEnrolled = enrolled.has(c.id);
          return (
            <Link key={c.id} href={`/app/explore/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="course-card">
                <div className="thumb">
                  {c.thumbnailUrl
                    ? <img src={c.thumbnailUrl} alt={c.title} />
                    : '📚'}
                  {isEnrolled && <span className="enrolled-badge">✓ Enrolled</span>}
                </div>
                <div className="body">
                  {c.category && <span className="cat">{c.category}</span>}
                  <div className="title">{c.title}</div>
                  {c.description && (
                    <div className="muted" style={{ fontSize: '.78rem', marginBottom: 6, lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {c.description}
                    </div>
                  )}
                  <div className="meta">
                    <Stars rating={c.avgRating} />
                    <span>{c.avgRating > 0 ? c.avgRating : '—'}</span>
                    <span>·</span>
                    <span>{c.totalLessons} lessons</span>
                    <span>·</span>
                    <span>{c.enrolledCount} enrolled</span>
                  </div>
                  <div className="foot">
                    {c.isFree ? (
                      <span className="price-tag free">FREE</span>
                    ) : (
                      <span className="price-tag"><span className="currency">₹</span>{Number(c.price).toLocaleString('en-IN')}</span>
                    )}
                    {isEnrolled ? (
                      <span className="badge green">Continue →</span>
                    ) : c.isFree ? (
                      <span className="btn btn-sm">Start Free</span>
                    ) : (
                      <span className="btn btn-sm">Buy Now</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    )}

    {/* Pagination */}
    {total > 20 && (
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
        <span className="muted" style={{ padding: '6px 12px' }}>Page {page} of {Math.ceil(total / 20)}</span>
        <button className="btn btn-ghost btn-sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    )}
  </>);
}
