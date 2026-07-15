import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const modules = await prisma.module.findMany({
    where: { organizationId: scope.organizationId },
    include: { _count: { select: { sections: true, courseModules: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ modules });
});

const createSchema = z.object({ title: z.string().min(2) });

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const { title } = await parseBody(req, createSchema);
  const mod = await prisma.module.create({
    data: { title, organizationId: session.organizationId },
  });
  return NextResponse.json({ module: mod }, { status: 201 });
});

