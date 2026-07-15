import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const results = await prisma.submission.findMany({
    where: { learnerId: session.userId, status: 'PUBLISHED' }, // own + published only
    select: {
      id: true, marks: true, feedback: true, isLate: true, createdAt: true,
      material: { select: { id: true, title: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ results });
});

