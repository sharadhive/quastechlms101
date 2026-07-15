import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const createSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  courseInterest: z.string().optional(),
  source: z.string().optional(),
  website: z.string().max(0).optional(), // honeypot — bots fill it, humans never see it
});

/** PUBLIC endpoint (rate-limit at proxy). Lands in the admin CRM queue — SRS 12.14. */
export const POST = withHandler(async (req: NextRequest) => {
  const data = await parseBody(req, createSchema);
  if (data.website) throw badRequest('Invalid submission'); // honeypot tripped
  if (!data.email && !data.phone) throw badRequest('Provide email or phone');

  const enquiry = await prisma.enquiry.create({
    data: {
      organizationId: data.organizationId,
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

