import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { getStorage } from '@/lib/adapters/storage';
import { keyBelongsTo, extOf } from '@/lib/utils/files';
import { writeWebmDuration } from '@/lib/utils/webm';
import { enqueue } from '@/lib/jobs/queue';

const createSchema = z.object({
  batchId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  title: z.string().min(1),
  fileKey: z.string().min(5),
  sizeBytes: z.number().optional(),
  /** from the in-browser class recorder: real length + where its Duration placeholder sits */
  durationMs: z.number().positive().max(24 * 3600_000).optional(),
  durationOffset: z.number().int().min(3).max(65536).optional(),
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
  if (data.sessionId) {
    const cls = await prisma.classSession.findFirst({ where: { id: data.sessionId, batchId: batch.id }, select: { id: true } });
    if (!cls) throw badRequest('That class does not belong to this batch');
  }
  // Browser recording → write its real length so students can jump around in the video
  if (data.durationMs && data.durationOffset)
    await writeWebmDuration(data.fileKey, data.durationOffset, data.durationMs).catch(() => false);

  // Instructor uploads wait for admin approval unless they were granted "Publish recordings directly"
  const needsApproval = session.role === 'INSTRUCTOR' && !(await can(session, 'publish_recordings'));

  // Check if file needs FFmpeg transcoding (non-MP4 formats like WebM from browser recorder)
  const ext = extOf(data.fileKey) ?? '';
  const needsTranscode = !['mp4', 'm4v'].includes(ext);

  const recording = await prisma.recording.create({
    data: {
      batchId: batch.id,
      sessionId: data.sessionId,
      title: data.title,
      fileKey: data.fileKey,
      sizeBytes: data.sizeBytes ? BigInt(Math.round(data.sizeBytes)) : null,
      uploadedById: session.userId,
      status: needsTranscode ? 'processing' : (needsApproval ? 'pending_approval' : 'published'),
    },
  });

  // Enqueue FFmpeg transcode job for non-MP4 recordings (WebM from browser, MKV, etc.)
  if (needsTranscode) {
    await enqueue('VIDEO_TRANSCODE_RECORDING', {
      recordingId: recording.id,
      organizationId: scope.organizationId,
      fileKey: data.fileKey,
      finalStatus: needsApproval ? 'pending_approval' : 'published',
    });
  }

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
