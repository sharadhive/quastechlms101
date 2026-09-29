import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { resolveBranchIds, geoFromParams } from '@/lib/geo';
import { generateTempPassword, publicProfile, stripTempPassword } from '@/lib/auth/passwords';
import { enqueue } from '@/lib/jobs/queue';

/** GET /api/learners?q=<phone|email|name>&lifecycle=&page=&pageSize= */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const lifecycle = sp.get('lifecycle') ?? undefined;
  const branchIds = await resolveBranchIds(scope.organizationId, geoFromParams(sp), scope.branchId);
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 20)));

  const where = {
    organizationId: scope.organizationId,
    ...(branchIds ? { branchId: { in: branchIds } } : {}),
    role: 'STUDENT' as const,
    ...(lifecycle ? { lifecycle: lifecycle as any } : {}),
    ...(q
      ? { OR: [{ email: { contains: q } }, { phone: { contains: q } }, { name: { contains: q } }] }
      : {}),
  };

  const [total, learners] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, lifecycle: true, branchId: true, profile: true,
        isActive: true, mustChangePassword: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total, page, pageSize,
    learners: learners.map((l) => ({ ...l, profile: publicProfile(l.profile) })),
  });
});

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  branchId: z.string().min(1).optional(),
  profile: z.record(z.unknown()).optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const data = await parseBody(req, createSchema);

  // BRANCH_ADMIN can only create learners in their own branch
  const branchId =
    session.role === 'BRANCH_ADMIN' ? session.branchId : (data.branchId ?? session.branchId);
  if (branchId) {
    const b = await prisma.branch.findFirst({ where: { id: branchId, organizationId: session.organizationId } });
    if (!b) throw badRequest('Branch not found');
  }

  const tempPassword = generateTempPassword();
  const learner = await prisma.user.create({
    data: {
      organizationId: session.organizationId,
      branchId,
      role: 'STUDENT',
      lifecycle: 'ENROLLED',
      name: data.name,
      email: data.email.trim().toLowerCase(),
      phone: data.phone,
      profile: data.profile ? stripTempPassword(data.profile) : undefined,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
    },
    select: { id: true, name: true, email: true, phone: true, branchId: true },
  });

  // Login details go out by email; the temp password is also returned ONCE for the admin to share.
  await enqueue('EMAIL_WELCOME', { to: learner.email, name: learner.name, email: learner.email, tempPassword });
  return NextResponse.json({ learner, tempPassword }, { status: 201 });
});

