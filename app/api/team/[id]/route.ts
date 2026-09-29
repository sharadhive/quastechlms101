import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { revokeAllForUser } from '@/lib/auth/tokens';
import { audit } from '@/lib/utils/audit';

const schema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR']).optional(),
  branchId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/team/:id — edit a team member, change role/branch, or deactivate.
 * Super Admin can manage everyone; Admin can manage instructors only.
 */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const data = await parseBody(req, schema);

  const target = await prisma.user.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId, role: { in: ['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR'] } },
  });
  if (!target) throw notFound('Team member not found');
  if (target.id === session.userId && (data.isActive === false || data.role))
    throw badRequest('You cannot deactivate yourself or change your own role');

  const touchesAdmin = target.role !== 'INSTRUCTOR' || (data.role && data.role !== 'INSTRUCTOR');
  if (touchesAdmin && session.role !== 'SUPER_ADMIN')
    throw forbidden('Only the Super Admin can manage admin accounts');

  const newRole = data.role ?? target.role;
  const newBranch = data.branchId === undefined ? target.branchId : data.branchId;
  if (newRole === 'BRANCH_ADMIN' && !newBranch) throw badRequest('A Branch Admin needs a branch');
  if (data.branchId) {
    const b = await prisma.branch.findFirst({ where: { id: data.branchId, organizationId: session.organizationId } });
    if (!b) throw badRequest('Branch not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: target.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.role ? { role: data.role } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, branchId: true, isActive: true },
    });
    await audit(tx, {
      organizationId: session.organizationId, actorId: session.userId, action: 'TEAM_UPDATE',
      entity: 'User', entityId: target.id,
      before: { role: target.role, branchId: target.branchId, isActive: target.isActive },
      after: { role: u.role, branchId: u.branchId, isActive: u.isActive },
    });
    return u;
  });

  // Role/branch/active changes must take effect now → sign them out everywhere
  if (data.isActive === false || data.role || data.branchId !== undefined) await revokeAllForUser(target.id);
  return NextResponse.json({ user: updated });
});
