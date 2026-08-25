import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { resolveBranchIds, geoFromParams } from '@/lib/geo';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const d30 = new Date(Date.now() - 29 * 86400_000); d30.setHours(0, 0, 0, 0);
  const m6 = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const branchIds = await resolveBranchIds(scope.organizationId, geoFromParams(req.nextUrl.searchParams), scope.branchId);
  const branchScope: any = branchIds ? { branchId: { in: branchIds } } : {};
  const userBranchScope: any = branchIds ? { branchId: { in: branchIds } } : {};
  const orgCourse = { organizationId: scope.organizationId };
  // When no branch filter, don't filter by batch at all (batch is optional on Enrollment)
  const enrWhere: any = branchIds
    ? { course: orgCourse, batch: { branchId: { in: branchIds } } }
    : { course: orgCourse };

  const [
    enrollmentsThisMonth, enrollmentsPrevMonth, activeBatches, pendingEvaluations,
    feeAgg, recent, todaysSessions, payments6m, collections30,
    enrollments, branches, courses, enquiryCount, learnerCount,
    attendanceAll, ratingAgg, sessions30,
  ] = await Promise.all([
    prisma.enrollment.count({ where: { enrolledAt: { gte: monthStart }, ...enrWhere } }),
    prisma.enrollment.count({ where: { enrolledAt: { gte: prevMonthStart, lt: monthStart }, ...enrWhere } }),
    prisma.batch.count({ where: { course: orgCourse, ...branchScope, OR: [{ endDate: null }, { endDate: { gte: now } }] } }),
    prisma.submission.count({ where: { status: 'PENDING', material: { section: { module: orgCourse } } } }),
    prisma.feeAccount.aggregate({ _sum: { pendingAmount: true, totalFee: true, discount: true },
      where: { enrollment: { status: { in: ['ACTIVE', 'COMPLETED'] }, ...enrWhere } } }),
    prisma.enrollment.findMany({ where: { enrolledAt: { gte: d30 }, ...enrWhere }, select: { enrolledAt: true } }),
    prisma.classSession.findMany({
      where: { scheduledAt: { gte: dayStart, lte: dayEnd }, batch: { course: orgCourse, ...branchScope } },
      select: { id: true, title: true, scheduledAt: true, startedAt: true, meetLink: true,
        batch: { select: { id: true, name: true, course: { select: { title: true } }, _count: { select: { enrollments: true } } } } },
      orderBy: { scheduledAt: 'asc' },
    }),
    prisma.feePayment.findMany({
      where: { receivedAt: { gte: m6 }, feeAccount: { enrollment: enrWhere } },
      select: { amount: true, mode: true, receivedAt: true },
    }),
    prisma.feePayment.aggregate({ _sum: { amount: true },
      where: { receivedAt: { gte: d30 }, feeAccount: { enrollment: enrWhere } } }),
    prisma.enrollment.findMany({
      where: enrWhere,
      select: { status: true, progressPct: true, batchId: true,
        course: { select: { title: true } }, batch: { select: { branchId: true } } },
    }),
    prisma.branch.findMany({ where: { organizationId: scope.organizationId }, select: { id: true, name: true } }),
    prisma.course.count({ where: { ...orgCourse, status: 'PUBLISHED' } }),
    prisma.enquiry.count({ where: { organizationId: scope.organizationId } }),
    prisma.user.count({ where: { organizationId: scope.organizationId, role: 'STUDENT', ...userBranchScope } }),
    prisma.attendance.findMany({
      where: { session: { batch: { course: orgCourse, ...branchScope } } }, select: { present: true },
    }),
    prisma.feedbackResponse.aggregate({ _avg: { rating: true }, _count: { rating: true },
      where: { rating: { not: null }, form: { organizationId: scope.organizationId } } }),
    prisma.classSession.count({ where: { scheduledAt: { gte: d30, lte: now }, batch: { course: orgCourse, ...branchScope } } }),
  ]);

  // 30-day enrollment trend
  const daily: { date: string; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(d30.getTime() + i * 86400_000);
    daily.push({ date: `${d.getDate()}/${d.getMonth() + 1}`, count: 0 });
  }
  for (const e of recent) {
    const idx = Math.floor((new Date(e.enrolledAt).setHours(0, 0, 0, 0) - d30.getTime()) / 86400_000);
    if (idx >= 0 && idx < 30) daily[idx].count++;
  }

  // 6-month revenue bars
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const revenue: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenue.push({ label: MON[d.getMonth()], value: 0 });
  }
  const modeMap = new Map<string, number>();
  for (const p of payments6m) {
    const d = new Date(p.receivedAt);
    const idx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 5;
    if (idx >= 0 && idx < 6) revenue[idx].value += Number(p.amount);
    modeMap.set(p.mode, (modeMap.get(p.mode) ?? 0) + Number(p.amount));
  }

  // course-wise + branch-wise + status distributions
  const courseMap = new Map<string, number>(); const branchMap = new Map<string, number>();
  const statusMap = new Map<string, number>();
  let active = 0, completed = 0;
  for (const e of enrollments) {
    courseMap.set(e.course.title, (courseMap.get(e.course.title) ?? 0) + 1);
    // batch is optional — only count branch if batch exists
    const bid = e.batch?.branchId;
    if (bid) branchMap.set(bid, (branchMap.get(bid) ?? 0) + 1);
    statusMap.set(e.status, (statusMap.get(e.status) ?? 0) + 1);
    if (e.status === 'ACTIVE') active++;
    if (e.status === 'COMPLETED') completed++;
  }
  const bName = new Map(branches.map((b) => [b.id, b.name]));
  const totalFee = Number(feeAgg._sum.totalFee ?? 0) - Number(feeAgg._sum.discount ?? 0);
  const pending = Number(feeAgg._sum.pendingAmount ?? 0);
  const presentCount = attendanceAll.filter((a) => a.present).length;

  return NextResponse.json({
    // KPIs
    enrollmentsThisMonth,
    enrollmentsDelta: enrollmentsPrevMonth > 0
      ? Math.round(((enrollmentsThisMonth - enrollmentsPrevMonth) / enrollmentsPrevMonth) * 100)
      : enrollmentsThisMonth > 0 ? 100 : 0,
    activeBatches, pendingEvaluations,
    pendingFeesTotal: pending,
    collections30: Number(collections30._sum.amount ?? 0),
    totalLearners: learnerCount, publishedCourses: courses, totalEnquiries: enquiryCount,
    avgRating: ratingAgg._avg.rating, ratingCount: ratingAgg._count.rating,
    attendanceRate: attendanceAll.length ? Math.round((presentCount / attendanceAll.length) * 100) : 0,
    sessionsHeld30: sessions30,
    completionRate: enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0,
    collectionRate: totalFee > 0 ? Math.round(((totalFee - pending) / totalFee) * 100) : 0,
    // charts
    dailyEnrollments: daily,
    revenueByMonth: revenue,
    paymentModes: [...modeMap.entries()].map(([label, value]) => ({ label, value: Math.round(value) })),
    feeSplit: [{ label: 'Collected', value: Math.round(totalFee - pending) }, { label: 'Pending', value: Math.round(pending) }],
    enrollmentsByCourse: [...courseMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    enrollmentsByBranch: [...branchMap.entries()].map(([id, value]) => ({ label: bName.get(id) ?? '—', value })),
    statusSplit: [...statusMap.entries()].map(([label, value]) => ({ label, value })),
    funnel: [
      { label: 'Enquiries', value: enquiryCount },
      { label: 'Learners created', value: learnerCount },
      { label: 'Enrolled', value: enrollments.length },
      { label: 'Active', value: active },
      { label: 'Completed', value: completed },
    ],
    todaysSessions,
  });
});
