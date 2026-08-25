import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

/** GET /api/payments/status/:txnId — check order status */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { txnId: string } }) => {
  const session = await requireRole(req, ['STUDENT']);

  const order = await prisma.onlineOrder.findFirst({
    where: {
      gatewayTxnId: ctx.params.txnId,
      learnerId: session.userId,
    },
    select: {
      id: true,
      status: true,
      amount: true,
      courseId: true,
      enrollmentId: true,
      createdAt: true,
      course: { select: { title: true } },
    },
  });

  if (!order) throw notFound('Order not found');

  return NextResponse.json({ order });
});
