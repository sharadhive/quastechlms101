import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

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
    },
  });
  if (!batch) throw notFound('Batch not found');
  if (!(await getStorage().exists(data.fileKey))) throw badRequest('fileKey not found in storage');

  // Org toggle (branding JSON: { recordingApproval: true }) — instructor uploads await approval
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: scope.organizationId },
  });
  const needsApproval =
    session.role === 'INSTRUCTOR' && (org.branding as any)?.recordingApproval === true;

  const recording = await prisma.recording.create({
    data: {
      batchId: batch.id,
      sessionId: data.sessionId,
      title: data.title,
      fileKey: data.fileKey,
      sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null,
      uploadedById: session.userId,
      status: needsApproval ? 'pending_approval' : 'published',
    },
  });
  return NextResponse.json(
    { recording: { ...recording, sizeBytes: recording.sizeBytes?.toString() ?? null } },
    { status: 201 },
  );
});

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const batchId = req.nextUrl.searchParams.get('batchId') ?? undefined;
  const recordings = await prisma.recording.findMany({
    where: {
      ...(batchId ? { batchId } : {}),
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({
    recordings: recordings.map((r) => ({ ...r, sizeBytes: r.sizeBytes?.toString() ?? null })),
  });
});

