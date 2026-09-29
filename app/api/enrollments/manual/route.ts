import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { audit } from '@/lib/utils/audit';
import { enqueue } from '@/lib/jobs/queue';

const schema = z.object({
  learnerId: z.string().min(1),
  batchId: z.string().min(1),
  fee: z.object({
    totalFee: z.number().nonnegative(),
    discount: z.number().nonnegative().default(0),
    firstPayment: z
      .object({
        amount: z.number().positive(),
        mode: z.enum(['CASH', 'UPI', 'CHEQUE', 'BANK']),
        referenceNo: z.string().optional(),
      })
      .optional(),
    installments: z
      .array(z.object({ dueDate: z.string(), amount: z.number().positive() }))
      .optional(),
    notes: z.string().optional(),
  }),
  accessExpiry: z.string().datetime().optional(),
});

async function nextReceiptNo(tx: Prisma.TransactionClient, organizationId: string) {
  const year = new Date().getFullYear();
  const counter = await tx.receiptCounter.upsert({
    where: { organizationId_year: { organizationId, year } },
    update: { seq: { increment: 1 } }, // row-locked increment — safe under concurrency
    create: { organizationId, year, seq: 1 },
  });
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return `${org.receiptPrefix}-${year}-${String(counter.seq).padStart(5, '0')}`;
}

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const input = await parseBody(req, schema);
  const { fee } = input;
  const discount = fee.discount ?? 0;

  if (discount > fee.totalFee) throw badRequest('Discount cannot exceed total fee');
  const netFee = fee.totalFee - discount;
  const firstAmount = fee.firstPayment?.amount ?? 0;
  if (firstAmount > netFee) throw badRequest('Payment cannot exceed the net payable fee');

  // Validate learner + batch INSIDE the caller's scope before writing anything
  const learner = await prisma.user.findFirst({
    where: { id: input.learnerId, role: 'STUDENT', organizationId: scope.organizationId, isActive: true },
  });
  if (!learner) throw notFound('Learner not found or deactivated');

  const batch = await prisma.batch.findFirst({
    where: {
      id: input.batchId,
      course: { organizationId: scope.organizationId },
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { enrollments: { where: { status: { in: ['ACTIVE', 'COMPLETED'] } } } } },
    },
  });
  if (!batch) throw notFound('Batch not found');
  if (batch.capacity && batch._count.enrollments >= batch.capacity)
    throw conflict(`Batch "${batch.name}" is full (${batch.capacity} seats). Pick another batch or raise its capacity.`);

  const previous = await prisma.enrollment.findUnique({
    where: { learnerId_courseId: { learnerId: learner.id, courseId: batch.course.id } },
  });
  if (previous)
    throw conflict(
      previous.status === 'DROPPED' || previous.status === 'EXPIRED'
        ? `This learner has a ${previous.status.toLowerCase()} enrollment for this course — reactivate it from the learner's profile instead.`
        : 'This learner is already enrolled in this course.',
    );

  // ── One transaction: enrollment + fee account + first payment + audit (SRS 12.3) ──
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.create({
        data: {
          learnerId: learner.id,
          courseId: batch.course.id,
          batchId: batch.id,
          assignedById: session.userId,
          accessExpiry: input.accessExpiry ? new Date(input.accessExpiry) : null,
        },
      });

      const feeAccount = await tx.feeAccount.create({
        data: {
          enrollmentId: enrollment.id,
          totalFee: new Prisma.Decimal(fee.totalFee),
          discount: new Prisma.Decimal(discount),
          pendingAmount: new Prisma.Decimal(netFee - firstAmount),
          installments: (fee.installments as any) ?? undefined,
          notes: fee.notes,
        },
      });

      let payment = null;
      if (fee.firstPayment && firstAmount > 0) {
        payment = await tx.feePayment.create({
          data: {
            feeAccountId: feeAccount.id,
            amount: new Prisma.Decimal(firstAmount),
            mode: fee.firstPayment.mode,
            referenceNo: fee.firstPayment.referenceNo,
            receiptNo: await nextReceiptNo(tx, scope.organizationId),
            receivedById: session.userId,
          },
        });
      }

      await tx.user.update({ where: { id: learner.id }, data: { lifecycle: 'ACTIVE' } });

      await audit(tx, {
        organizationId: scope.organizationId,
        actorId: session.userId,
        action: 'ENROLLMENT_CREATE',
        entity: 'Enrollment',
        entityId: enrollment.id,
        after: { learnerId: learner.id, batchId: batch.id, netFee, firstAmount },
      });

      return { enrollment, feeAccount, payment };
    });
  } catch (err: any) {
    if (err?.code === 'P2002') throw conflict('This learner is already enrolled in this course');
    throw err;
  }

  // Installment due reminders: dueDate - 3 days (SRS 3.8 / 12.10)
  if (fee.installments?.length) {
    for (const inst of fee.installments) {
      const runAt = new Date(new Date(inst.dueDate).getTime() - 3 * 86400_000);
      if (runAt > new Date())
        await enqueue(
          'EMAIL_FEE_REMINDER',
          { to: learner.email, name: learner.name, pendingAmount: inst.amount, dueDate: inst.dueDate },
          runAt,
        );
    }
  }

  // After commit: enrolment email via job queue (SRS 12.3). Login details were sent when the
  // account was created; this mail links to the login + "forgot password" pages.
  await enqueue('EMAIL_ENROLLED', {
    to: learner.email,
    name: learner.name,
    courseTitle: batch.course.title,
    batchName: batch.name,
  });

  if (result.payment)
    await enqueue('RENDER_RECEIPT_PDF', { paymentId: result.payment.id });

  return NextResponse.json(
    {
      enrollmentId: result.enrollment.id,
      pendingAmount: result.feeAccount.pendingAmount,
      receiptNo: result.payment?.receiptNo ?? null,
    },
    { status: 201 },
  );
});

