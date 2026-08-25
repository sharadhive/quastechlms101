import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { thumbnailUrl } from '@/lib/utils/thumbnail';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const course = await prisma.course.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
    include: {
      courseModules: {
        orderBy: { position: 'asc' },
        include: {
          module: {
            include: {
              sections: {
                orderBy: { position: 'asc' },
                include: { materials: { orderBy: { position: 'asc' }, include: { variants: { select: { id: true, label: true, heightPx: true } } } } },
              },
            },
          },
        },
      },
      batches: { select: { id: true, name: true, branchId: true, startDate: true } },
    },
  });
  if (!course) throw notFound('Course not found');
  const resolved = { ...course, thumbnailUrl: await thumbnailUrl(course.thumbnailKey) };
  return NextResponse.json({ course: resolved });
});

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  thumbnailKey: z.string().optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  price: z.number().nonnegative().optional(),
  isFree: z.boolean().optional(),
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, patchSchema);
  const existing = await prisma.course.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
  });
  if (!existing) throw notFound('Course not found');
  const course = await prisma.course.update({ where: { id: existing.id }, data });
  return NextResponse.json({ course });
});
