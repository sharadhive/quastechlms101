import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';

interface Hit { type: string; label: string; sub?: string; href: string; icon: string; }

/** GET /api/search?q= — searches only what the caller's role is allowed to see. */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const org = session.organizationId;
  const like = { contains: q };
  const hits: Hit[] = [];

  if (session.role === 'STUDENT') {
    const enrollments = await prisma.enrollment.findMany({
      where: { learnerId: session.userId, course: { title: like } },
      include: { course: { select: { title: true } } }, take: 5,
    });
    for (const e of enrollments)
      hits.push({ type: 'Course', label: e.course.title, sub: `${e.progressPct}% complete`, href: `/app/courses/${e.id}`, icon: '📚' });

    const mine = await prisma.enrollment.findMany({ where: { learnerId: session.userId }, select: { id: true, courseId: true } });
    const lessons = await prisma.material.findMany({
      where: { title: like, status: 'published',
        section: { module: { courseModules: { some: { courseId: { in: mine.map((m) => m.courseId) } } } } } },
      include: { section: { include: { module: { include: { courseModules: { select: { courseId: true } } } } } } },
      take: 6,
    });
    for (const l of lessons) {
      const cId = l.section.module.courseModules[0]?.courseId;
      const enr = mine.find((m) => m.courseId === cId);
      if (enr) hits.push({ type: 'Lesson', label: l.title, sub: l.type, href: `/app/courses/${enr.id}`, icon: '▶️' });
    }
    return NextResponse.json({ hits });
  }

  if (session.role === 'INSTRUCTOR') {
    const batches = await prisma.batch.findMany({
      where: { instructorId: session.userId, OR: [{ name: like }, { course: { title: like } }] },
      include: { course: { select: { title: true } } }, take: 6,
    });
    for (const b of batches)
      hits.push({ type: 'Batch', label: b.name, sub: b.course.title, href: `/instructor/batches/${b.id}`, icon: '🎓' });

    const myBatchIds = (await prisma.batch.findMany({ where: { instructorId: session.userId }, select: { id: true } })).map((b) => b.id);
    const learners = await prisma.enrollment.findMany({
      where: { batchId: { in: myBatchIds }, learner: { OR: [{ name: like }, { email: like }, { phone: like }] } },
      include: { learner: { select: { name: true, email: true } }, batch: { select: { id: true, name: true } } }, take: 6,
    });
    for (const e of learners)
      if (e.batch)
        hits.push({ type: 'Learner', label: e.learner.name, sub: e.batch.name, href: `/instructor/batches/${e.batch.id}`, icon: '🧑‍🎓' });
    return NextResponse.json({ hits });
  }

  // ADMIN / BRANCH_ADMIN / SUPER_ADMIN
  const branchScope = session.role === 'BRANCH_ADMIN' && session.branchId ? { branchId: session.branchId } : {};
  const [learners, courses, batches, enquiries] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: org, role: 'STUDENT', ...branchScope, OR: [{ name: like }, { email: like }, { phone: like }] },
      select: { id: true, name: true, email: true, phone: true }, take: 6,
    }),
    prisma.course.findMany({ where: { organizationId: org, title: like }, select: { id: true, title: true, status: true }, take: 5 }),
    prisma.batch.findMany({
      where: { course: { organizationId: org }, ...branchScope, OR: [{ name: like }, { course: { title: like } }] },
      include: { course: { select: { title: true } } }, take: 5,
    }),
    prisma.enquiry.findMany({
      where: { organizationId: org, OR: [{ name: like }, { phone: like }, { email: like }] },
      select: { id: true, name: true, phone: true }, take: 5,
    }),
  ]);
  for (const l of learners)
    hits.push({ type: 'Learner', label: l.name, sub: l.phone ?? l.email, href: `/admin/learners/${l.id}`, icon: '🧑‍🎓' });
  for (const c of courses)
    hits.push({ type: 'Course', label: c.title, sub: c.status, href: `/admin/courses/${c.id}`, icon: '📚' });
  for (const b of batches)
    hits.push({ type: 'Batch', label: b.name, sub: b.course.title, href: `/admin/batches`, icon: '🎓' });
  for (const e of enquiries)
    hits.push({ type: 'Enquiry', label: e.name, sub: e.phone ?? '', href: `/admin/enquiries`, icon: '📥' });

  return NextResponse.json({ hits });
});
