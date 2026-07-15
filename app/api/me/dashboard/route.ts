import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const d56 = new Date(Date.now() - 55 * 86400_000); d56.setHours(0, 0, 0, 0);

  // Fetch enrollments FIRST — MaterialProgress / Certificate / FeeAccount are keyed by
  // enrollmentId and have no relation field, so they must be filtered by id list.
  const allEnrollments = await prisma.enrollment.findMany({
    where: { learnerId: session.userId },
    select: { id: true, status: true, progressPct: true, course: { select: { title: true } } },
  });
  const enrollmentIds = allEnrollments.map((e) => e.id);

  const [continueLearning, todaysClasses, banners, unreadCount,
    submissions, attendance, myProgress, points, badges, certificates, feeAgg] = await Promise.all([
    prisma.enrollment.findMany({
      where: { learnerId: session.userId, status: 'ACTIVE' },
      select: { id: true, progressPct: true, course: { select: { id: true, title: true, thumbnailKey: true } } },
      orderBy: { enrolledAt: 'desc' }, take: 6,
    }),
    prisma.classSession.findMany({
      where: { scheduledAt: { gte: dayStart, lte: dayEnd },
        batch: { enrollments: { some: { learnerId: session.userId, status: 'ACTIVE' } } } },
      select: { id: true, title: true, scheduledAt: true, meetLink: true, startedAt: true,
        batch: { select: { name: true, course: { select: { title: true } } } } },
      orderBy: { scheduledAt: 'asc' },
    }),
    prisma.banner.findMany({
      where: { organizationId: session.organizationId, isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { position: 'asc' },
    }),
    prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
    prisma.submission.findMany({
      where: { learnerId: session.userId, status: 'PUBLISHED', marks: { not: null } },
      select: { marks: true, createdAt: true, material: { select: { title: true } } },
      orderBy: { createdAt: 'asc' }, take: 10,
    }),
    prisma.attendance.findMany({ where: { learnerId: session.userId }, select: { present: true } }),
    enrollmentIds.length
      ? prisma.materialProgress.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          select: { completedAt: true },
        })
      : Promise.resolve([] as { completedAt: Date }[]),
    prisma.pointEntry.aggregate({ _sum: { points: true }, where: { userId: session.userId } }),
    prisma.userBadge.count({ where: { userId: session.userId } }),
    enrollmentIds.length
      ? prisma.certificate.count({ where: { enrollmentId: { in: enrollmentIds }, revokedAt: null } })
      : Promise.resolve(0),
    enrollmentIds.length
      ? prisma.feeAccount.aggregate({ _sum: { pendingAmount: true }, where: { enrollmentId: { in: enrollmentIds } } })
      : Promise.resolve({ _sum: { pendingAmount: null } } as any),
  ]);

  const present = attendance.filter((a) => a.present).length;
  const avgProgress = allEnrollments.length
    ? Math.round(allEnrollments.reduce((a, e) => a + Number(e.progressPct), 0) / allEnrollments.length) : 0;

  // 8-week learning activity heatmap
  const days: { date: string; count: number }[] = [];
  for (let i = 0; i < 56; i++) {
    const d = new Date(d56.getTime() + i * 86400_000);
    days.push({ date: d.toLocaleDateString(), count: 0 });
  }
  for (const p of myProgress) {
    const idx = Math.floor((new Date(p.completedAt).setHours(0, 0, 0, 0) - d56.getTime()) / 86400_000);
    if (idx >= 0 && idx < 56) days[idx].count++;
  }

  return NextResponse.json({
    continueLearning, todaysClasses, banners, unreadCount,
    myPoints: points._sum.points ?? 0,
    badgeCount: badges,
    certificateCount: certificates,
    lessonsDone: myProgress.length,
    attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : 0,
    avgProgress,
    pendingFees: Number(feeAgg?._sum?.pendingAmount ?? 0),
    progressByCourse: allEnrollments.map((e) => ({ label: e.course.title, value: Math.round(Number(e.progressPct)) })),
    statusSplit: [
      { label: 'In progress', value: allEnrollments.filter((e) => e.status === 'ACTIVE').length },
      { label: 'Completed', value: allEnrollments.filter((e) => e.status === 'COMPLETED').length },
    ].filter((x) => x.value > 0),
    scoreTrend: submissions.map((s) => ({ label: s.material.title.slice(0, 10), value: Number(s.marks) })),
    activity: days,
  });
});