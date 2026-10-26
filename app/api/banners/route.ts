import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';

const createSchema = z.object({
  title: z.string().min(1),
  imageKey: z.string().min(5),
  link: z.string().url().optional(),
  position: z.number().int().nonnegative().default(0),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const data = await parseBody(req, createSchema);
  if (!(await getStorage().exists(data.imageKey))) throw badRequest('imageKey not in storage');
  const banner = await prisma.banner.create({
    data: {
      organizationId: session.organizationId,
      title: data.title,
      imageKey: data.imageKey,
      link: data.link,
      position: data.position,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
    },
  });
  return NextResponse.json({ banner }, { status: 201 });
});

/** Any authenticated user — admins see all banners; students see only active ones with valid dates. */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'].includes(session.role);
  const now = new Date();

  const where: any = { organizationId: session.organizationId };
  if (!isAdmin) {
    // Students only see active banners within their date range
    where.isActive = true;
    where.OR = [{ startsAt: null }, { startsAt: { lte: now } }];
    where.AND = [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }];
  }

  const banners = await prisma.banner.findMany({ where, orderBy: { position: 'asc' } });
  const storage = getStorage();
  const withUrls = await Promise.all(
    banners.map(async (b) => ({ ...b, imageUrl: await storage.signedGetUrl(b.imageKey, 3600) })),
  );
  return NextResponse.json({ banners: withUrls });
});

