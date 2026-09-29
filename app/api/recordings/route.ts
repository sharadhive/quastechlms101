import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { getStorage } from '@/lib/adapters/storage';
import { keyBelongsTo } from '@/lib/utils/files';

const createSchema = z.object({
  batchId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  title: z.string().min(1),
  fileKey: z.string().min(5),
  sizeBytes: z.number().optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const data = await parseBody(req, createSchema);

  const batch = await prisma.batch.findFirst({
    where: {
      id: data.batchId,
      course: { organizationId: scope.organizationId },
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
  });
  if (!batch) throw notFound('Batch not found');
  if (!keyBelongsTo(scope.organizationId, data.fileKey, ['recording', 'material'])) throw badRequest('Invalid file');
  if (!(await getStorage().exists(data.fileKey))) throw badRequest('fileKey not found in storage');

  // Instructor uploads wait for admin approval unless they were granted "Publish recordings directly"
  const needsApproval = session.role === 'INSTRUCTOR' && !(await can(session, 'publish_recordings'));

  const recording = await prisma.recording.create({
    data: {
      batchId: batch.id,
      sessionId: data.sessionId,
      title: data.title,
      fileKey: data.fileKey,
      sizeBytes: data.sizeBytes ? BigInt(Math.round(data.sizeBytes)) : null,
      uploadedById: session.userId,
      status: needsApproval ? 'pending_approval' : 'published',
    },
  });
  return NextResponse.json(
    { recording: { ...recording, sizeBytes: recording.sizeBytes?.toString() ?? null } },
    { status: 201 },
  );
});

/** Staff list: ?batchId= &status= (admins see all batches in scope, instructors their own). */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const batchId = req.nextUrl.searchParams.get('batchId') ?? undefined;
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const recordings = await prisma.recording.findMany({
    where: {
      ...(batchId ? { batchId } : {}),
      ...(status ? { status } : {}),
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
      },
    },
    include: { batch: { select: { id: true, name: true, course: { select: { title: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  const uploaders = await prisma.user.findMany({
    where: { id: { in: [...new Set(recordings.map((r) => r.uploadedById))] } },
    select: { id: true, name: true },
  });
  const uname = new Map(uploaders.map((u) => [u.id, u.name]));
  return NextResponse.json({
    recordings: recordings.map((r) => ({
      ...r, sizeBytes: r.sizeBytes?.toString() ?? null, uploadedBy: uname.get(r.uploadedById) ?? '—',
    })),
  });
});
