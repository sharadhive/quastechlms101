import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const courses = await prisma.course.findMany({
    where: { organizationId: scope.organizationId, ...(status ? { status: status as any } : {}) },
    include: { _count: { select: { batches: true, enrollments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ courses });
});

const createSchema = z.object({
  title: z.string().min(2),
  categoryId: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PRIVATE'),
  price: z.number().nonnegative().default(0),
  isFree: z.boolean().default(false),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const data = await parseBody(req, createSchema);
  const course = await prisma.course.create({
    data: { ...data, organizationId: session.organizationId },
  });
  return NextResponse.json({ course }, { status: 201 });
});

