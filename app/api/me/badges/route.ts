import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { ensureBadges } from '@/lib/gamify';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  await ensureBadges();
  const [all, mine] = await Promise.all([
    prisma.badge.findMany({ orderBy: { pointsReward: 'asc' } }),
    prisma.userBadge.findMany({ where: { userId: session.userId } }),
  ]);
  const earned = new Set(mine.map((m) => m.badgeId));
  return NextResponse.json({
    badges: all.map((b) => ({ ...b, earned: earned.has(b.id) })),
  });
});
