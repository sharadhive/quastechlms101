import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest, conflict, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { initiatePayment } from '@/lib/integrations/easebuzz';

const schema = z.object({
  courseId: z.string().min(1),
});

/** Authenticated POST /api/payments/initiate — start Easebuzz payment for a course */
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
  if (isFree) throw badRequest('This course is free. Use the free enrollment endpoint.');

  // Check if already enrolled
  const existing = await prisma.enrollment.findUnique({
    where: { learnerId_courseId: { learnerId: session.userId, courseId } },
  });
  if (existing) throw conflict('You are already enrolled in this course.');

  // Get student info
  const student = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  // Generate unique transaction ID
  const txnId = `QS_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Create order record
  const order = await prisma.onlineOrder.create({
    data: {
      organizationId: session.organizationId,
      learnerId: session.userId,
      courseId,
      amount: course.price,
      gateway: 'EASEBUZZ',
      gatewayTxnId: txnId,
      status: 'PENDING',
    },
  });

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  // Initiate Easebuzz payment
  const result = await initiatePayment({
    txnId,
    amount: Number(course.price),
    productInfo: course.title,
    customerName: student.name,
    customerEmail: student.email,
    customerPhone: student.phone ?? '9999999999',
    successUrl: `${appUrl}/api/payments/callback`,
    failureUrl: `${appUrl}/api/payments/callback`,
    udf1: order.id,      // our order ID
    udf2: courseId,       // course ID for quick lookup
  }, session.organizationId);

  return NextResponse.json({
    paymentUrl: result.paymentUrl,
    txnId,
    orderId: order.id,
  });
});
