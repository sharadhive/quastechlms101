import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { requireSession, startSession } from '@/lib/auth/session';
import { revokeAllForUser } from '@/lib/auth/tokens';

/**
 * GET /api/auth/profile — fetch the current user's profile details.
 * Works for any authenticated user (admin, super admin, instructor).
 */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, name: true, email: true, phone: true,
      role: true, branchId: true, isActive: true,
      createdAt: true,
      organization: { select: { id: true, name: true } },
    },
  });
  if (!user || !user.isActive) throw forbidden('Account not active');
  return NextResponse.json({ user });
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, 'Minimum 8 characters').optional(),
}).refine(
  (d) => !d.newPassword || d.currentPassword,
  { message: 'Current password is required to set a new password', path: ['currentPassword'] },
);

/**
 * PATCH /api/auth/profile — update own name, email, phone, or password.
 * Any admin/super-admin/instructor can update their own profile.
 * Email uniqueness is enforced per organisation.
 * Password change requires current password verification.
 */
export const PATCH = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const data = await parseBody(req, updateSchema);

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) throw forbidden('Account not active');

  // If changing email, check uniqueness within org
  if (data.email && data.email !== user.email) {
    const exists = await prisma.user.findFirst({
      where: { organizationId: user.organizationId, email: data.email, id: { not: user.id } },
    });
    if (exists) throw badRequest('This email is already used by another account in your organisation');
  }

  // If changing password, verify current password
  if (data.newPassword) {
    const ok = await bcrypt.compare(data.currentPassword!, user.passwordHash);
    if (!ok) throw badRequest('Current password is incorrect');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.newPassword ? {
        passwordHash: await bcrypt.hash(data.newPassword, 12),
        mustChangePassword: false,
      } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });

  // If email or password changed, revoke other sessions and re-issue for current device
  if (data.email || data.newPassword) {
    await revokeAllForUser(user.id);
    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    return startSession(fullUser!);
  }

  return NextResponse.json({ user: updated });
});
