import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['INSTRUCTOR']);
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const d56 = new Date(Date.now() - 55 * 86400_000); d56.setHours(0, 0, 0, 0);

  const batches = await prisma.batch.findMany({
    where: { instructorId: session.userId },
    select: { id: true, name: true, course: { select: { title: true } }, _count: { select: { enrollments: true } } },
  });
  const batchIds = batches.map((b) => b.id);

  const enrollments = await prisma.enrollment.findMany({
    where: { batchId: { in: batchIds } },
    select: { learnerId: true, status: true, progressPct: true },
  });
  const learnerIds = enrollments.map((e) => e.learnerId);

  const [todaysSessions, submissions, attendance, ratings, sessions56, qnaOpen] = await Promise.all([
    prisma.classSession.findMany({
      where: { scheduledAt: { gte: dayStart, lte: dayEnd }, batchId: { in: batchIds } },
      select: { id: true, title: true, scheduledAt: true, meetLink: true, startedAt: true,
        batch: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
    }),
    prisma.submission.findMany({
      where: { learnerId: { in: learnerIds } },
      select: { status: true, marks: true, createdAt: true },
    }),
    prisma.attendance.findMany({
      where: { session: { batchId: { in: batchIds } } },
      select: { present: true, markedAt: true, sessionId: true },
    }),
    prisma.feedbackResponse.findMany({
      where: { rating: { not: null }, form: { targetType: 'BATCH', targetId: { in: batchIds } } },
      select: { rating: true },
    }),
    prisma.classSession.findMany({
      where: { batchId: { in: batchIds }, scheduledAt: { gte: d56, lte: now } },
      select: { scheduledAt: true },
    }),
    prisma.courseQnA.count({
      where: { parentId: null, resolvedAt: null,
        courseId: { in: (await prisma.batch.findMany({ where: { instructorId: session.userId }, select: { courseId: true } })).map((b) => b.courseId) } },
    }),
  ]);

  const present = attendance.filter((a) => a.present).length;
  const graded = submissions.filter((s) => s.status === 'PUBLISHED' && s.marks !== null);
  const avgMarks = graded.length ? graded.reduce((a, s) => a + Number(s.marks), 0) / graded.length : 0;

  // rating distribution 1..5
  const ratingDist = [1, 2, 3, 4, 5].map((r) => ({ label: `${r}★`, value: ratings.filter((x) => x.rating === r).length }));

  // 8-week teaching activity heatmap
  const days: { date: string; count: number }[] = [];
  for (let i = 0; i < 56; i++) {
    const d = new Date(d56.getTime() + i * 86400_000);
    days.push({ date: d.toLocaleDateString(), count: 0 });
  }
  for (const s of sessions56) {
    const idx = Math.floor((new Date(s.scheduledAt).setHours(0, 0, 0, 0) - d56.getTime()) / 86400_000);
    if (idx >= 0 && idx < 56) days[idx].count++;
  }

  const avgProgress = enrollments.length
    ? Math.round(enrollments.reduce((a, e) => a + Number(e.progressPct), 0) / enrollments.length) : 0;

  return NextResponse.json({
    myBatches: batches.length,
    totalLearners: enrollments.length,
    pendingEvaluations: submissions.filter((s) => s.status === 'PENDING').length,
    openQuestions: qnaOpen,
    avgRating: ratings.length ? ratings.reduce((a, r) => a + (r.rating ?? 0), 0) / ratings.length : null,
    ratingCount: ratings.length,
    attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : 0,
    avgProgress,
    avgMarks: Math.round(avgMarks * 10) / 10,
    sessionsHeld: sessions56.length,
    learnersByBatch: batches.map((b) => ({ label: b.name, value: b._count.enrollments })),
    submissionSplit: [
      { label: 'Pending', value: submissions.filter((s) => s.status === 'PENDING').length },
      { label: 'Evaluated', value: submissions.filter((s) => s.status === 'EVALUATED').length },
      { label: 'Published', value: submissions.filter((s) => s.status === 'PUBLISHED').length },
    ].filter((x) => x.value > 0),
    statusSplit: [
      { label: 'Active', value: enrollments.filter((e) => e.status === 'ACTIVE').length },
      { label: 'Completed', value: enrollments.filter((e) => e.status === 'COMPLETED').length },
      { label: 'Dropped', value: enrollments.filter((e) => e.status === 'DROPPED').length },
    ].filter((x) => x.value > 0),
    ratingDist,
    activity: days,
    todaysSessions,
  });
});
