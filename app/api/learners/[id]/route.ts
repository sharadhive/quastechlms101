import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { publicProfile } from '@/lib/auth/passwords';
import { revokeAllForUser } from '@/lib/auth/tokens';
import { audit } from '@/lib/utils/audit';

/** Learner 360°: profile, enrollments (+batch options), fees & payments, certificates. */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);

  const learner = await prisma.user.findFirst({
    where: { id: ctx.params.id, role: 'STUDENT', ...scope }, // out-of-scope UUID → 404
    select: {
      id: true, name: true, email: true, phone: true, lifecycle: true, isActive: true,
      mustChangePassword: true, branchId: true, profile: true, createdAt: true,
      enrollments: {
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true, status: true, enrolledAt: true, progressPct: true, accessExpiry: true, courseId: true,
          course: {
            select: {
              id: true, title: true,
              batches: { select: { id: true, name: true, capacity: true, _count: { select: { enrollments: true } } } },
            },
          },
          batch: { select: { id: true, name: true } },
          feeAccount: {
            select: {
              totalFee: true, discount: true, pendingAmount: true,
              payments: {
                orderBy: { receivedAt: 'desc' },
                select: { id: true, amount: true, mode: true, referenceNo: true, receiptNo: true, receivedAt: true },
              },
            },
          },
        },
      },
    },
  });
  if (!learner) throw notFound('Learner not found');

  const certificates = await prisma.certificate.findMany({
    where: { enrollmentId: { in: learner.enrollments.map((e) => e.id) } },
    select: { id: true, enrollmentId: true, verifyCode: true, issuedAt: true, revokedAt: true, pdfKey: true },
  });
  return NextResponse.json({
    learner: {
      ...learner,
      profile: publicProfile(learner.profile),
      enrollments: learner.enrollments.map((e) => ({
        ...e,
        certificate: certificates.find((c) => c.enrollmentId === e.id) ?? null,
      })),
    },
  });
});

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  branchId: z.string().min(1).nullable().optional(),
  lifecycle: z.enum(['LEAD', 'ENQUIRY', 'ENROLLED', 'ACTIVE', 'COMPLETED', 'DROPPED']).optional(),
  isActive: z.boolean().optional(),
});

/** Edit learner details, move branch, change lifecycle, or deactivate (blocks login). */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, patchSchema);
  const learner = await prisma.user.findFirst({ where: { id: ctx.params.id, role: 'STUDENT', ...scope } });
  if (!learner) throw notFound('Learner not found');

  if (data.branchId) {
    if (scope.branchId && data.branchId !== scope.branchId) throw badRequest('You can only use your own branch');
    const b = await prisma.branch.findFirst({ where: { id: data.branchId, organizationId: scope.organizationId } });
    if (!b) throw badRequest('Branch not found');
  }
  if (data.email) {
    const clash = await prisma.user.findFirst({
      where: { organizationId: scope.organizationId, email: data.email, id: { not: learner.id } },
    });
    if (clash) throw badRequest('Another account already uses this email');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: learner.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.email ? { email: data.email.trim().toLowerCase() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
        ...(data.lifecycle ? { lifecycle: data.lifecycle } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, branchId: true, lifecycle: true, isActive: true },
    });
    await audit(tx, {
      organizationId: scope.organizationId, actorId: session.userId, action: 'LEARNER_UPDATE',
      entity: 'User', entityId: learner.id,
      before: { email: learner.email, branchId: learner.branchId, lifecycle: learner.lifecycle, isActive: learner.isActive },
      after: { email: u.email, branchId: u.branchId, lifecycle: u.lifecycle, isActive: u.isActive },
    });
    return u;
  });
  if (data.isActive === false) await revokeAllForUser(learner.id); // signed out everywhere
  return NextResponse.json({ learner: updated });
});
