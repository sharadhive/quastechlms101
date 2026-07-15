import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({
  type: z.enum(['VIDEO', 'PDF', 'QUIZ', 'ASSIGNMENT', 'LINK', 'LIVE']),
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
  fileKey: z.string().optional(),      // from /api/uploads (VIDEO/PDF)
  sizeBytes: z.number().optional(),
  durationSec: z.number().optional(),
  quizSchema: z
    .object({
      timeLimitMin: z.number().positive().optional(),
      attemptsAllowed: z.number().int().positive().default(1),
      shuffle: z.boolean().default(true),
      showAnswers: z.boolean().default(false),
      questions: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          options: z.array(z.string()).min(2),
          correct: z.array(z.number().int().nonnegative()).min(1),
          marks: z.number().positive().default(1),
          negative: z.number().nonnegative().default(0),
        }),
      ).min(1),
    })
    .optional(),
  externalUrl: z.string().url().optional(), // LINK type
});

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  if (session.role === 'INSTRUCTOR' && !(await can(session, 'manage_content')))
    throw forbidden('You do not have permission to edit course content');
  const scope = tenantScope(session);
  const data = await parseBody(req, schema);

  const section = await prisma.section.findFirst({
    where: { id: ctx.params.id, module: { organizationId: scope.organizationId } },
  });
  if (!section) throw notFound('Section not found');

  if ((data.type === 'VIDEO' || data.type === 'PDF') && !data.fileKey)
    throw badRequest(`${data.type} material requires fileKey (upload first)`);
  if (data.type === 'QUIZ' && !data.quizSchema) throw badRequest('QUIZ requires quizSchema');
  if (data.fileKey && !(await getStorage().exists(data.fileKey)))
    throw badRequest('fileKey not found in storage');

  const material = await prisma.material.create({
    data: {
      sectionId: section.id,
      type: data.type,
      title: data.title,
      position: data.position,
      fileKey: data.fileKey ?? (data.externalUrl ? undefined : null),
      sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null,
      durationSec: data.durationSec,
      quizSchema: (data.quizSchema as any) ?? (data.externalUrl ? { url: data.externalUrl } : undefined),
      status: data.type === 'VIDEO' ? 'processing' : 'published',
    },
  });

  // v1: mark video published immediately after storage verify (duration probe = later HLS phase)
  if (material.type === 'VIDEO')
    await prisma.material.update({ where: { id: material.id }, data: { status: 'published' } });

  return NextResponse.json(
    { material: { ...material, sizeBytes: material.sizeBytes?.toString() ?? null } },
    { status: 201 },
  );
});
