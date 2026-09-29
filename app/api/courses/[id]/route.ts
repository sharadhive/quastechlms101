import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { taughtCourseIds } from '@/lib/auth/content';
import { can } from '@/lib/auth/permissions';
import { thumbnailUrl } from '@/lib/utils/thumbnail';
import { keyBelongsTo } from '@/lib/utils/files';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  if (session.role === 'INSTRUCTOR' && !(await taughtCourseIds(session.userId)).includes(ctx.params.id))
    throw notFound('Course not found');

  const course = await prisma.course.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
    include: {
      courseModules: {
        orderBy: { position: 'asc' },
        include: {
          module: {
            include: {
              _count: { select: { courseModules: true } },
              sections: {
                orderBy: { position: 'asc' },
                include: {
                  materials: {
                    orderBy: { position: 'asc' },
                    include: {
                      variants: { select: { id: true, label: true, heightPx: true } },
                      _count: { select: { submissions: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      batches: {
        select: {
          id: true, name: true, branchId: true, startDate: true, instructorId: true,
          _count: { select: { enrollments: true } },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });
  if (!course) throw notFound('Course not found');
  const canEditContent =
    session.role !== 'INSTRUCTOR' || (await can(session, 'manage_content'));
  return NextResponse.json({
    course: { ...course, thumbnailUrl: await thumbnailUrl(course.thumbnailKey) },
    access: { canEditContent, canEditDetails: session.role !== 'INSTRUCTOR' },
  });
});

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  thumbnailKey: z.string().optional(),
  categoryId: z.string().min(1).nullable().optional(),
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
  if (data.thumbnailKey && !keyBelongsTo(scope.organizationId, data.thumbnailKey, ['thumbnail']))
    throw badRequest('Invalid thumbnail upload');
  if (data.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: data.categoryId, organizationId: scope.organizationId } });
    if (!cat) throw badRequest('Category not found');
    data.category = cat.name;
  }
  if (data.status === 'PUBLISHED') {
    const lessons = await prisma.material.count({
      where: { status: 'published', section: { module: { courseModules: { some: { courseId: existing.id } } } } },
    });
    if (lessons === 0) throw badRequest('Add at least one lesson before publishing');
  }
  const course = await prisma.course.update({ where: { id: existing.id }, data });
  return NextResponse.json({ course });
});

/** Delete a course created by mistake. Courses with students or batches must be archived instead. */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const course = await prisma.course.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
    include: { _count: { select: { enrollments: true, batches: true, orders: true } } },
  });
  if (!course) throw notFound('Course not found');
  if (course._count.enrollments || course._count.batches || course._count.orders)
    throw conflict('This course has batches or students. Set its status to Archived instead of deleting.');
  await prisma.course.delete({ where: { id: course.id } }); // module links cascade; modules stay in the library
  return NextResponse.json({ ok: true });
});
