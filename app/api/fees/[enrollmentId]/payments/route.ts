import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { audit } from '@/lib/utils/audit';
import { enqueue } from '@/lib/jobs/queue';

const schema = z.object({
  amount: z.number().positive(),
  mode: z.enum(['CASH', 'UPI', 'CHEQUE', 'BANK']),
  referenceNo: z.string().optional(),
});

export const POST = withHandler(
  async (req: NextRequest, ctx: { params: { enrollmentId: string } }) => {
    const session = await requireRole(req, ADMIN_ROLES);
    const scope = tenantScope(session);
    const { amount, mode, referenceNo } = await parseBody(req, schema);

    const receipt = await prisma.$transaction(async (tx) => {
      // Load + validate fee account inside caller's scope
      const fee = await tx.feeAccount.findFirst({
        where: {
          enrollmentId: ctx.params.enrollmentId,
          enrollment: {
            course: { organizationId: scope.organizationId },
            ...(scope.branchId ? { batch: { branchId: scope.branchId } } : {}),
          },
        },
      });
      if (!fee) throw notFound('Fee account not found');
      if (new Prisma.Decimal(amount).gt(fee.pendingAmount))
        throw badRequest(`Amount exceeds pending balance (${fee.pendingAmount})`);

      const year = new Date().getFullYear();
      const counter = await tx.receiptCounter.upsert({
        where: { organizationId_year: { organizationId: scope.organizationId, year } },
        update: { seq: { increment: 1 } },
        create: { organizationId: scope.organizationId, year, seq: 1 },
      });
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: scope.organizationId },
      });
      const receiptNo = `${org.receiptPrefix}-${year}-${String(counter.seq).padStart(5, '0')}`;

      const payment = await tx.feePayment.create({
        data: {
          feeAccountId: fee.id,
          amount: new Prisma.Decimal(amount),
          mode,
          referenceNo,
          receiptNo,
          receivedById: session.userId,
        },
      });

      // pendingAmount decremented in the SAME transaction (SRS 12.3)
      await tx.feeAccount.update({
        where: { id: fee.id },
        data: { pendingAmount: { decrement: new Prisma.Decimal(amount) } },
      });

      await audit(tx, {
        organizationId: scope.organizationId,
        actorId: session.userId,
        action: 'FEE_PAYMENT_RECORD',
        entity: 'FeePayment',
        entityId: payment.id,
        after: { amount, mode, receiptNo },
      });

      return payment;
    });

    await enqueue('RENDER_RECEIPT_PDF', { paymentId: receipt.id }); // printable receipt (SRS 3.8)

    return NextResponse.json(
      { paymentId: receipt.id, receiptNo: receipt.receiptNo },
      { status: 201 },
    );
  },
);
