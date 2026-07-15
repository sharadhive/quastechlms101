import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({
  marks: z.number().nonnegative(),
  feedback: z.string().optional(),
});

async function loadScoped(req: NextRequest, id: string) {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const submission = await prisma.submission.findFirst({
    where: {
      id,
      material: { section: { module: { organizationId: scope.organizationId } } },
      ...(session.role === 'INSTRUCTOR'
        ? {
            learnerId: {
              in: (
                await prisma.enrollment.findMany({
                  where: { batch: { instructorId: session.userId } },
                  select: { learnerId: true },
                })
              ).map((e) => e.learnerId),
            },
          }
        : {}),
    },
  });
  if (!submission) throw notFound('Submission not found');
  return { session, submission };
}

/** GET → view the submitted file (signed URL) */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { submission } = await loadScoped(req, ctx.params.id);
  const fileUrl = submission.fileKey
    ? await getStorage().signedGetUrl(submission.fileKey, 3600)
    : null;
  return NextResponse.json({ submission: { ...submission, marks: submission.marks }, fileUrl });
});

/** POST → marks + feedback → EVALUATED (SRS 12.8) */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { submission } = await loadScoped(req, ctx.params.id);
  const { marks, feedback } = await parseBody(req, schema);
  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: { marks: new Prisma.Decimal(marks), feedback, status: 'EVALUATED' },
  });
  return NextResponse.json({ submission: { id: updated.id, status: updated.status } });
});
