import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
  isDownloadable: z.boolean().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  /** hidden = kept (with all student results) but invisible to students */
  status: z.enum(['processing', 'published', 'hidden']).optional(),
  externalUrl: z.string().url().optional(),
  assignment: z
    .object({ instructions: z.string().max(5000).optional(), dueAt: z.string().datetime().nullable().optional(), maxMarks: z.number().positive().optional() })
    .optional(),
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { materialId: ctx.params.id });
  const { externalUrl, assignment, ...data } = await parseBody(req, schema);
  const current = await prisma.material.findUniqueOrThrow({ where: { id: ctx.params.id } });

  let quizSchema: any = undefined;
  if (externalUrl && (current.type === 'LINK' || current.type === 'LIVE')) quizSchema = { url: externalUrl };
  if (assignment && current.type === 'ASSIGNMENT')
    quizSchema = { ...((current.quizSchema as any) ?? {}), ...assignment, dueAt: assignment.dueAt ?? undefined };

  const material = await prisma.material.update({
    where: { id: ctx.params.id },
    data: { ...data, ...(quizSchema ? { quizSchema } : {}) },
  });
  return NextResponse.json({ material: { ...material, sizeBytes: material.sizeBytes?.toString() ?? null } });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { materialId: ctx.params.id });

  const m = await prisma.material.findUniqueOrThrow({
    where: { id: ctx.params.id },
    include: { variants: { select: { fileKey: true } }, _count: { select: { submissions: true } } },
  });
  if (m._count.submissions > 0)
    throw conflict(`${m._count.submissions} student(s) already submitted this. Use "Hide" instead so their results are kept.`);

  await prisma.material.delete({ where: { id: m.id } });
  await prisma.materialProgress.deleteMany({ where: { materialId: m.id } });
  const storage = getStorage();
  for (const key of [m.fileKey, ...m.variants.map((v) => v.fileKey)])
    if (key) await storage.delete(key).catch(() => {}); // free disk space
  return NextResponse.json({ ok: true });
});
