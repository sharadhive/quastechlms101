import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ? new Date(sp.get('from')!) : new Date(Date.now() - 30 * 86400_000);
  const to = sp.get('to') ? new Date(sp.get('to')!) : new Date();
  const mode = sp.get('mode') ?? undefined;

  const payments = await prisma.feePayment.findMany({
    where: {
      receivedAt: { gte: from, lte: to },
      ...(mode ? { mode: mode as any } : {}),
      feeAccount: {
        enrollment: {
          course: { organizationId: scope.organizationId },
          ...(scope.branchId ? { batch: { branchId: scope.branchId } } : {}),
        },
      },
    },
    select: { amount: true, mode: true, receivedAt: true, receiptNo: true },
    orderBy: { receivedAt: 'desc' },
  });

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  const byMode: Record<string, number> = {};
  for (const p of payments) byMode[p.mode] = (byMode[p.mode] ?? 0) + Number(p.amount);

  // ?format=csv streams the same data as a download (SRS 12.13)
  if (sp.get('format') === 'csv') {
    const csv = ['receiptNo,amount,mode,receivedAt']
      .concat(payments.map((p) => `${p.receiptNo},${p.amount},${p.mode},${p.receivedAt.toISOString()}`))
      .join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="collections.csv"',
      },
    });
  }
  return NextResponse.json({ from, to, total, byMode, count: payments.length, payments });
});

