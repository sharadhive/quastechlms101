import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { enqueue } from '@/lib/jobs/queue';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const team = await prisma.user.findMany({
    where: {
      ...scope,
      role: (() => {
        const r = req.nextUrl.searchParams.get('role');
        return r && ['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR'].includes(r)
          ? (r as any)
          : { in: ['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR'] as any };
      })(),
    },
    select: { id: true, name: true, email: true, phone: true, role: true, branchId: true, profile: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ team });
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
    throw forbidden('Only Super Admin can create admin accounts');

  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const user = await prisma.user.create({
    data: {
      organizationId: session.organizationId,
      branchId: data.branchId ?? null,
      role: data.role,
      name: data.name,
      email: data.email,
      phone: data.phone,
      profile: { tempPassword },
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
    },
    select: { id: true, name: true, email: true, role: true, branchId: true, profile: true },
  });

  await enqueue('EMAIL_WELCOME', {
    to: data.email,
    name: data.name,
    email: data.email,
    tempPassword,
  });

  return NextResponse.json({ user, tempPassword }, { status: 201 });
});

