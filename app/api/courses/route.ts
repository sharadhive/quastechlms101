import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { taughtCourseIds } from '@/lib/auth/content';
import { thumbnailUrl } from '@/lib/utils/thumbnail';

/** Admins see every course; instructors see only the courses they teach. */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const mine = session.role === 'INSTRUCTOR' ? await taughtCourseIds(session.userId) : null;
  const courses = await prisma.course.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(status ? { status: status as any } : {}),
      ...(mine ? { id: { in: mine } } : {}),
    },
    include: {
      _count: { select: { batches: true, enrollments: true, courseModules: true } },
      courseModules: { select: { module: { select: { sections: { select: { _count: { select: { materials: true } } } } } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const rows = await Promise.all(
    courses.map(async ({ courseModules, ...c }) => ({
      ...c,
      thumbnailUrl: await thumbnailUrl(c.thumbnailKey),
      lessonCount: courseModules.reduce(
        (a, cm) => a + cm.module.sections.reduce((b, s) => b + s._count.materials, 0), 0),
    })),
  );
  return NextResponse.json({ courses: rows });
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
  if (data.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: data.categoryId, organizationId: session.organizationId } });
    if (!cat) throw badRequest('Category not found');
    data.category = cat.name;
  }
  const course = await prisma.course.create({
    data: { ...data, organizationId: session.organizationId },
  });
  return NextResponse.json({ course }, { status: 201 });
});
