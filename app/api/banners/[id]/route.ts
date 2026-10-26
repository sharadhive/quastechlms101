import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  link: z.string().url().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  imageKey: z.string().min(5).optional(),
});

/** PATCH /api/banners/:id — edit a banner (title, link, active, dates, image). */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const data = await parseBody(req, patchSchema);

  const banner = await prisma.banner.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
  });
  if (!banner) throw notFound('Banner not found');

  // If replacing image, verify the new key exists
  if (data.imageKey && !(await getStorage().exists(data.imageKey))) {
    throw badRequest('imageKey not in storage');
  }

  const updated = await prisma.banner.update({
    where: { id: banner.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.link !== undefined ? { link: data.link } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
      ...(data.endsAt !== undefined ? { endsAt: data.endsAt ? new Date(data.endsAt) : null } : {}),
      ...(data.imageKey ? { imageKey: data.imageKey } : {}),
    },
  });

  // If image was replaced, clean up old one (best-effort)
  if (data.imageKey && data.imageKey !== banner.imageKey) {
    getStorage().delete(banner.imageKey).catch(() => {});
  }

  return NextResponse.json({ banner: updated });
});

/** DELETE /api/banners/:id — permanently delete a banner and its image. */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);

  const banner = await prisma.banner.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
  });
  if (!banner) throw notFound('Banner not found');

  await prisma.banner.delete({ where: { id: banner.id } });

  // Clean up the image from storage (best-effort, don't fail if it errors)
  getStorage().delete(banner.imageKey).catch(() => {});

  return NextResponse.json({ ok: true });
});
