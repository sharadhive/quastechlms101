import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { verifyCallback } from '@/lib/integrations/easebuzz';

/**
 * POST /api/payments/callback — Easebuzz redirects here after payment.
 * This is a form POST with payment result params.
 * We verify the hash, update the order, auto-enroll on success, then redirect.
 */
export const POST = withHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = String(value); });

  const txnId = params.txnid ?? '';
  const orderId = params.udf1 ?? '';
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  // Find the order
  const order = await prisma.onlineOrder.findFirst({
    where: { gatewayTxnId: txnId },
  });

  if (!order) {
    return NextResponse.redirect(`${appUrl}/app/payment-failed?reason=order_not_found`);
  }

  // Verify hash
  const { verified, status } = await verifyCallback(params, order.organizationId);

  // Store the full response regardless
  await prisma.onlineOrder.update({
    where: { id: order.id },
    data: {
      gatewayResponse: params as any,
      gatewayOrderId: params.easepayid ?? params.paymentid ?? null,
    },
  });

  if (!verified) {
    await prisma.onlineOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED' },
    });
    return NextResponse.redirect(`${appUrl}/app/payment-failed?txn=${txnId}&reason=hash_mismatch`);
  }

  if (status === 'success') {
    // Payment successful — auto-enroll
    try {
      const enrollment = await prisma.$transaction(async (tx) => {
        // Create enrollment
        const enr = await tx.enrollment.create({
          data: {
            learnerId: order.learnerId,
            courseId: order.courseId,
            assignedById: order.learnerId, // self-enrolled
            status: 'ACTIVE',
          },
        });

        // Create fee account + payment record
        const feeAccount = await tx.feeAccount.create({
          data: {
            enrollmentId: enr.id,
            totalFee: order.amount,
            discount: new Prisma.Decimal(0),
            pendingAmount: new Prisma.Decimal(0), // fully paid
          },
        });

        // Generate receipt number
        const year = new Date().getFullYear();
        const counter = await tx.receiptCounter.upsert({
          where: { organizationId_year: { organizationId: order.organizationId, year } },
          update: { seq: { increment: 1 } },
          create: { organizationId: order.organizationId, year, seq: 1 },
        });
        const org = await tx.organization.findUniqueOrThrow({ where: { id: order.organizationId } });
        const receiptNo = `${org.receiptPrefix}-${year}-${String(counter.seq).padStart(5, '0')}`;

        await tx.feePayment.create({
          data: {
            feeAccountId: feeAccount.id,
            amount: order.amount,
            mode: 'ONLINE',
            referenceNo: params.easepayid ?? txnId,
            receiptNo,
            receivedById: order.learnerId,
          },
        });

        // Update learner lifecycle
        await tx.user.update({
          where: { id: order.learnerId },
          data: { lifecycle: 'ACTIVE' },
        });

        return enr;
      });

      // Mark order as paid with enrollment link
      await prisma.onlineOrder.update({
        where: { id: order.id },
        data: { status: 'PAID', enrollmentId: enrollment.id },
      });

      return NextResponse.redirect(`${appUrl}/app/payment-success?txn=${txnId}&course=${order.courseId}`);
    } catch (err: any) {
      // Enrollment failed (maybe duplicate) — still mark payment as paid
      await prisma.onlineOrder.update({
        where: { id: order.id },
        data: { status: 'PAID' },
      });
      console.error('[payment-callback] enrollment failed:', err);
      return NextResponse.redirect(`${appUrl}/app/payment-success?txn=${txnId}&course=${order.courseId}&note=already_enrolled`);
    }
  } else {
    // Payment failed or pending
    await prisma.onlineOrder.update({
      where: { id: order.id },
      data: { status: status === 'pending' ? 'PENDING' : 'FAILED' },
    });
    return NextResponse.redirect(`${appUrl}/app/payment-failed?txn=${txnId}&reason=${status}`);
  }
});
