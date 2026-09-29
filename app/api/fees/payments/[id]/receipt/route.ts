import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';
import { enqueue } from '@/lib/jobs/queue';

/** GET → signed link to the receipt PDF (admins in scope, or the learner who paid). */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireSession(req);
  const payment = await prisma.feePayment.findUnique({
    where: { id: ctx.params.id },
    include: {
      feeAccount: {
        select: {
          enrollment: {
            select: {
              learnerId: true,
              batch: { select: { branchId: true } },
              course: { select: { organizationId: true } },
            },
          },
        },
      },
    },
  });
  const enr = payment?.feeAccount.enrollment;
  if (!payment || !enr || enr.course.organizationId !== session.organizationId) throw notFound('Receipt not found');

  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'].includes(session.role);
  if (!isAdmin && enr.learnerId !== session.userId) throw forbidden();
  if (session.role === 'BRANCH_ADMIN' && session.branchId && enr.batch?.branchId !== session.branchId) throw forbidden();

  const key = `org/${enr.course.organizationId}/receipts/${payment.id}.pdf`;
  const storage = getStorage();
  if (!(await storage.exists(key))) {
    await enqueue('RENDER_RECEIPT_PDF', { paymentId: payment.id });
    throw notFound('The receipt is being generated — please try again in a minute');
  }
  return NextResponse.json({ url: await storage.signedGetUrl(key, 600), receiptNo: payment.receiptNo });
});
