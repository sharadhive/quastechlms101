import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireSession(req);
  const material = await prisma.material.findFirst({
    where: { id: ctx.params.id, section: { module: { organizationId: session.organizationId } } },
    include: { variants: { orderBy: { heightPx: 'desc' } } },
  });
  if (!material) throw notFound('Material not found');
  return NextResponse.json({
    variants: material.variants.map((v) => ({ id: v.id, label: v.label, heightPx: v.heightPx })),
  });
});

const schema = z.object({
  label: z.string().min(2),          // "720p"
  heightPx: z.number().int().positive(),
  fileKey: z.string().min(1),
  sizeBytes: z.number().optional(),
});

/** Admin uploads an extra quality version of the same lecture. */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const material = await prisma.material.findFirst({
    where: { id: ctx.params.id, type: 'VIDEO', section: { module: { organizationId: scope.organizationId } } },
  });
  if (!material) throw notFound('Video material not found');
  const data = await parseBody(req, schema);
  if (!(await getStorage().exists(data.fileKey))) throw badRequest('fileKey not found in storage');

  const variant = await prisma.materialVariant.upsert({
    where: { materialId_label: { materialId: material.id, label: data.label } },
    update: { fileKey: data.fileKey, heightPx: data.heightPx, sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null },
    create: {
      materialId: material.id, label: data.label, heightPx: data.heightPx,
      fileKey: data.fileKey, sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null,
    },
  });
  return NextResponse.json({ variant }, { status: 201 });
});
