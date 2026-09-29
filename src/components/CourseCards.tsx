'use client';
import Link from 'next/link';

/** Grid of course tiles used by the admin and instructor "Courses" pages. */
export default function CourseCards({ courses, base }: { courses: any[]; base: string }) {
  return (
    <div className="course-cards">
      {courses.map((c) => (
        <Link key={c.id} href={`${base}/${c.id}`} className="course-tile">
          <div className="thumb">{c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" /> : '📘'}</div>
          <div className="body">
            <b>{c.title}</b>
            <div className="actions" style={{ gap: 6 }}>
              <span className={`badge ${c.status === 'PUBLISHED' ? 'green' : c.status === 'ARCHIVED' ? 'gray' : 'amber'}`}>{c.status}</span>
              <span className={`badge ${c.visibility === 'PUBLIC' ? 'blue' : 'gray'}`}>{c.visibility === 'PUBLIC' ? '🌐 Public' : '🔒 Private'}</span>
              {c.isFree || Number(c.price) === 0
                ? <span className="badge green">FREE</span>
                : <span className="badge gray">₹{Number(c.price).toLocaleString('en-IN')}</span>}
            </div>
            <div className="meta">
              {c._count?.courseModules ?? 0} modules · {c.lessonCount ?? 0} lessons · {c._count?.batches ?? 0} batches · {c._count?.enrollments ?? 0} students
            </div>
            <span style={{ marginTop: 'auto', color: 'var(--brand)', fontWeight: 600, fontSize: '.85rem' }}>Open builder →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
