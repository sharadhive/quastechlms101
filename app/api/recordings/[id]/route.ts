import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

async function load(req: NextRequest, id: string) {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const rec = await prisma.recording.findFirst({
    where: {
      id,
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
      },
    },
  });
  if (!rec) throw notFound('Recording not found');
  return { session, rec };
}

const schema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['published', 'pending_approval', 'hidden']).optional(),
});

/** Approve / hide / rename. Only admins change the status; instructors can rename their own uploads. */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { session, rec } = await load(req, ctx.params.id);
  const data = await parseBody(req, schema);
  if (data.status && session.role === 'INSTRUCTOR') throw forbidden('Only an admin can approve or hide recordings');
  const updated = await prisma.recording.update({ where: { id: rec.id }, data });
  return NextResponse.json({ recording: { ...updated, sizeBytes: updated.sizeBytes?.toString() ?? null } });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { session, rec } = await load(req, ctx.params.id);
  if (session.role === 'INSTRUCTOR' && rec.uploadedById !== session.userId)
    throw forbidden('You can delete only your own uploads');
  await prisma.recording.delete({ where: { id: rec.id } });
  await getStorage().delete(rec.fileKey).catch(() => {});
  return NextResponse.json({ ok: true });
});
