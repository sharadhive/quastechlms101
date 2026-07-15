import { prisma } from '@/lib/prisma';

/** Default badge set (idempotent ensure). Ported from QUASTECHLMS PRE badge system. */
const BADGES = [
  { code: 'FIRST_STEPS', name: 'First Steps', icon: '🚀', description: 'Completed your first lesson', pointsReward: 20 },
  { code: 'CONSISTENT_10', name: 'Consistent Learner', icon: '🔥', description: 'Completed 10 lessons', pointsReward: 50 },
  { code: 'QUIZ_MASTER', name: 'Quiz Master', icon: '🧠', description: 'Scored 100% in a quiz', pointsReward: 50 },
  { code: 'COURSE_CHAMPION', name: 'Course Champion', icon: '🏆', description: 'Completed a full course', pointsReward: 100 },
];

export async function ensureBadges() {
  for (const b of BADGES)
    await prisma.badge.upsert({ where: { code: b.code }, update: {}, create: b });
}

export async function addPoints(organizationId: string, userId: string, points: number, reason: string) {
  if (points <= 0) return;
  await prisma.pointEntry.create({ data: { organizationId, userId, points, reason } });
}

async function award(organizationId: string, userId: string, code: string) {
  const badge = await prisma.badge.findUnique({ where: { code } });
  if (!badge) return;
  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
  });
  if (existing) return;
  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
  await addPoints(organizationId, userId, badge.pointsReward, `badge:${code}`);
  await prisma.notification.create({
    data: { userId, type: 'BADGE', title: `Badge earned ${badge.icon}`, body: `${badge.name} — ${badge.description}`, link: '/app' },
  }).catch(() => {});
}

/** Hook: called after a material completion. */
export async function onMaterialCompleted(organizationId: string, learnerId: string, coursePct: number) {
  await ensureBadges();
  await addPoints(organizationId, learnerId, 10, 'lesson_complete');
  const totalDone = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) c FROM MaterialProgress mp
    JOIN Enrollment e ON e.id = mp.enrollmentId WHERE e.learnerId = ${learnerId}`;
  const done = Number(totalDone[0]?.c ?? 0);
  if (done >= 1) await award(organizationId, learnerId, 'FIRST_STEPS');
  if (done >= 10) await award(organizationId, learnerId, 'CONSISTENT_10');
  if (coursePct >= 100) {
    await addPoints(organizationId, learnerId, 100, 'course_complete');
    await award(organizationId, learnerId, 'COURSE_CHAMPION');
  }
}

/** Hook: called after a quiz submission. */
export async function onQuizScored(organizationId: string, learnerId: string, marks: number, maxMarks: number) {
  await ensureBadges();
  await addPoints(organizationId, learnerId, Math.round(marks), 'quiz_marks');
  if (maxMarks > 0 && marks >= maxMarks) await award(organizationId, learnerId, 'QUIZ_MASTER');
}
