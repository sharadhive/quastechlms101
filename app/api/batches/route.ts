import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { resolveBranchIds, geoFromParams } from '@/lib/geo';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const branchIds = await resolveBranchIds(scope.organizationId, geoFromParams(req.nextUrl.searchParams), scope.branchId);
  const courseId = req.nextUrl.searchParams.get('courseId') || undefined;
  const batches = await prisma.batch.findMany({
    where: {
      course: { organizationId: scope.organizationId },
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(courseId ? { courseId } : {}),
      // instructor scoping: own batches only (SRS 12.2 / RBAC matrix)
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
    },
    select: {
      id: true, name: true, startDate: true, endDate: true, capacity: true,
      batchTime: true, schedule: true, instructorId: true,
      course: { select: { id: true, title: true } },
      branch: { select: { id: true, name: true, city: true, state: true } },
      _count: { select: { enrollments: true, sessions: true } },
    },
    orderBy: { startDate: 'desc' },
  });
  return NextResponse.json({ batches });
});

const createSchema = z.object({
  courseId: z.string().min(1),
  branchId: z.string().min(1),
  instructorId: z.string().min(1).optional(),
  name: z.string().min(2),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  capacity: z.number().int().positive().optional(),
  batchTime: z.string().optional(),
  schedule: z.enum(['WEEKDAY', 'WEEKEND', 'CUSTOM']).optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, createSchema);

  const course = await prisma.course.findFirst({
    where: { id: data.courseId, organizationId: scope.organizationId },
  });
  if (!course) throw notFound('Course not found');
  if (scope.branchId && data.branchId !== scope.branchId) throw notFound('Branch not found');

  if (data.instructorId) {
    const instructor = await prisma.user.findFirst({
      where: { id: data.instructorId, role: 'INSTRUCTOR', organizationId: scope.organizationId },
    });
    if (!instructor) throw notFound('Instructor not found');
  }

  const batch = await prisma.batch.create({
    data: {
      courseId: data.courseId,
      branchId: data.branchId,
      instructorId: data.instructorId,
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      capacity: data.capacity,
      batchTime: data.batchTime,
      schedule: data.schedule,
    },
  });
  return NextResponse.json({ batch }, { status: 201 });
});

