import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest, conflict, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';

const schema = z.object({
  courseId: z.string().min(1),
});

/** Authenticated POST /api/catalog/enroll-free — enroll in a free course */
export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const { courseId } = await parseBody(req, schema);

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      organizationId: session.organizationId,
      status: 'PUBLISHED',
    },
  });
  if (!course) throw notFound('Course not found');

  const isFree = course.isFree || Number(course.price) === 0;
  if (!isFree) throw badRequest('This course is not free. Please use the payment flow.');

  // Check if already enrolled
  const existing = await prisma.enrollment.findUnique({
    where: { learnerId_courseId: { learnerId: session.userId, courseId } },
  });
  if (existing) throw conflict('You are already enrolled in this course.');

  // Create enrollment (no batch for self-paced)
  const enrollment = await prisma.enrollment.create({
    data: {
      learnerId: session.userId,
      courseId,
      assignedById: session.userId, // self-enrolled
      status: 'ACTIVE',
    },
  });

  // Update learner lifecycle to ACTIVE
  await prisma.user.update({
    where: { id: session.userId },
    data: { lifecycle: 'ACTIVE' },
  });

  return NextResponse.json({ enrollmentId: enrollment.id, status: 'enrolled' }, { status: 201 });
});
