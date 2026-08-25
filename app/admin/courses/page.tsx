'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';

export default function Courses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [title, setTitle] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [newCat, setNewCat] = useState(''); const [err, setErr] = useState('');
  const load = () => api('/api/courses').then((d) => setCourses(d.courses));
  const loadCats = () => api('/api/categories').then((d) => setCategories(d.categories));
  useEffect(() => { load(); loadCats(); }, []);
  const addCat = async () => {
    await api('/api/categories', { method: 'POST', json: { name: newCat } });
    setNewCat(''); loadCats();
  };
  const create = async () => {
    setErr('');
    try { await api('/api/courses', { method: 'POST', json: { title, categoryId: categoryId || undefined } }); setTitle(''); load(); }
    catch (e: any) { setErr(e.message); }
  };
  return (<>
    <div className="card">
      <div className="row">
        <input placeholder="New course title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" style={{ flex: '0 0 auto' }} onClick={create} disabled={title.length < 2}>Create course</button>
      </div>
      <div className="row" style={{ maxWidth: 420 }}>
        <input placeholder="＋ New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto' }} onClick={addCat} disabled={newCat.length < 2}>Add category</button>
      </div>
      {err && <div className="err">{err}</div>}
    </div>
    <div className="card"><table>
      <thead><tr><th>Title</th><th>Status</th><th>Visibility</th><th>Price</th><th>Batches</th><th>Enrollments</th><th></th></tr></thead>
      <tbody>{courses.map((c) => <tr key={c.id}>
        <td>{c.title}</td>
        <td><span className={`badge ${c.status === 'PUBLISHED' ? 'green' : 'gray'}`}>{c.status}</span></td>
        <td><span className={`badge ${c.visibility === 'PUBLIC' ? 'blue' : 'gray'}`}>{c.visibility === 'PUBLIC' ? '🌐 Public' : '🔒 Private'}</span></td>
        <td>{c.isFree || Number(c.price) === 0 ? <span className="badge green">FREE</span> : <b>₹{Number(c.price).toLocaleString('en-IN')}</b>}</td>
        <td>{c._count.batches}</td><td>{c._count.enrollments}</td>
        <td><Link href={`/admin/courses/${c.id}`}>Open builder</Link></td>
      </tr>)}</tbody>
    </table></div>
  </>);
}
