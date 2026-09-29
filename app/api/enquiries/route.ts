import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getSession } from '@/lib/auth/session';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const createSchema = z.object({
  organizationId: z.string().min(1).optional(),
  name: z.string().min(2),
  email: z.preprocess(blankToUndefined, z.string().email().optional()),
  phone: z.preprocess(blankToUndefined, z.string().min(6).optional()),
  courseInterest: z.string().optional(),
  source: z.string().optional(),
  website: z.string().max(0).optional(), // honeypot — bots fill it, humans never see it
});

/** PUBLIC endpoint (rate-limit at proxy). Lands in the admin CRM queue — SRS 12.14. */
export const POST = withHandler(async (req: NextRequest) => {
  const data = await parseBody(req, createSchema);
  if (data.website) throw badRequest('Invalid submission'); // honeypot tripped

  // A signed-in student asking for counselling: use their real contact details
  const session = await getSession(req);
  let organizationId = data.organizationId ?? process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';
  let branchId: string | null = null;
  if (session) {
    const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true, phone: true, branchId: true } });
    if (me) {
      organizationId = session.organizationId;
      branchId = me.branchId;
      data.name = me.name;
      data.email = data.email ?? me.email;
      data.phone = data.phone ?? me.phone ?? undefined;
    }
  }
  if (!data.email && !data.phone) throw badRequest('Provide email or phone');
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw badRequest('Unknown organisation');

  const enquiry = await prisma.enquiry.create({
    data: {
      organizationId,
      branchId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      courseInterest: data.courseInterest,
      source: data.source ?? 'website',
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: enquiry.id }, { status: 201 });
});

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const q = req.nextUrl.searchParams.get('q')?.trim();

  const branchFilter = scope.branchId
    ? { OR: [{ branchId: scope.branchId }, { branchId: null }] }
    : {};

  const searchFilter = q
    ? {
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const enquiries = await prisma.enquiry.findMany({
    where: {
      organizationId: scope.organizationId,
      ...branchFilter,
      ...searchFilter,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ enquiries });
});

