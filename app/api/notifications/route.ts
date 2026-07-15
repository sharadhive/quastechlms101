import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession } from '@/lib/auth/session';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const unreadOnly = req.nextUrl.searchParams.get('unread') !== null;
  const notifications = await prisma.notification.findMany({
    where: { userId: session.userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ notifications });
});

const patchSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export const PATCH = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { ids } = await parseBody(req, patchSchema);
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: session.userId }, // own rows only
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
});

