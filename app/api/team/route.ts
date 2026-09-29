import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, forbidden, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { enqueue } from '@/lib/jobs/queue';
import { generateTempPassword, publicProfile } from '@/lib/auth/passwords';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const r = req.nextUrl.searchParams.get('role');
  const team = await prisma.user.findMany({
    where: {
      ...scope,
      role: r && ['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR'].includes(r)
        ? (r as any)
        : { in: ['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR'] as any },
    },
    select: {
      id: true, name: true, email: true, phone: true, role: true, branchId: true, profile: true,
      isActive: true, mustChangePassword: true, createdAt: true,
    },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ team: team.map((t) => ({ ...t, profile: publicProfile(t.profile) })) });
});

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR']),
  branchId: z.string().min(1).optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const data = await parseBody(req, createSchema);

  // Only SUPER_ADMIN may create ADMIN/BRANCH_ADMIN accounts (RBAC matrix §3.1)
  if (data.role !== 'INSTRUCTOR' && session.role !== 'SUPER_ADMIN')
    throw forbidden('Only the Super Admin can create admin accounts');
  if (data.role === 'BRANCH_ADMIN' && !data.branchId) throw badRequest('Choose the branch this Branch Admin manages');
  if (data.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: data.branchId, organizationId: session.organizationId } });
    if (!branch) throw badRequest('Branch not found');
  }

  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      organizationId: session.organizationId,
      branchId: data.branchId ?? null,
      role: data.role,
      name: data.name,
      email: data.email.trim().toLowerCase(),
      phone: data.phone,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
    },
    select: { id: true, name: true, email: true, phone: true, role: true, branchId: true },
  });

  await enqueue('EMAIL_WELCOME', { to: user.email, name: user.name, email: user.email, tempPassword });

  // The temporary password is returned ONCE (to show/share now) and never stored in plain text.
  return NextResponse.json({ user, tempPassword }, { status: 201 });
});
