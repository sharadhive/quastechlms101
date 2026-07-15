import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({ fileKey: z.string().min(5) });

export const POST = withHandler(
  async (req: NextRequest, ctx: { params: { materialId: string } }) => {
    const session = await requireRole(req, ['STUDENT']);
    const { fileKey } = await parseBody(req, schema);

    const material = await prisma.material.findFirst({
      where: { id: ctx.params.materialId, type: 'ASSIGNMENT', status: 'published' },
      include: { section: { select: { moduleId: true } } },
    });
    if (!material) throw notFound('Assignment not found');

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        learnerId: session.userId,
        status: 'ACTIVE',
        course: { courseModules: { some: { moduleId: material.section.moduleId } } },
      },
    });
    if (!enrollment) throw forbidden('Not enrolled');
    if (!(await getStorage().exists(fileKey))) throw badRequest('Upload the file first');

    const meta = (material.quizSchema as any) ?? {}; // assignment meta rides in the same JSON field
    const dueAt = meta.dueAt ? new Date(meta.dueAt) : null;

    // resubmission allowed until evaluated (SRS 12.8)
    const existing = await prisma.submission.findUnique({
      where: { materialId_learnerId: { materialId: material.id, learnerId: session.userId } },
    });
    if (existing && existing.status !== 'PENDING')
      throw forbidden('Already evaluated — resubmission not allowed');

    const submission = await prisma.submission.upsert({
      where: { materialId_learnerId: { materialId: material.id, learnerId: session.userId } },
      update: { fileKey, isLate: dueAt ? new Date() > dueAt : false },
      create: {
        materialId: material.id,
        learnerId: session.userId,
        fileKey,
        status: 'PENDING',
        isLate: dueAt ? new Date() > dueAt : false,
      },
    });
    return NextResponse.json({ submissionId: submission.id, isLate: submission.isLate }, { status: 201 });
  },
);
