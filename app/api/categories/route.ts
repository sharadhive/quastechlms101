import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { requireSession } from '@/lib/auth/session';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const categories = await prisma.category.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ categories });
});

const schema = z.object({ name: z.string().min(2) });

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const { name } = await parseBody(req, schema);
  const category = await prisma.category.create({
    data: { organizationId: session.organizationId, name },
  });
  return NextResponse.json({ category }, { status: 201 });
});
