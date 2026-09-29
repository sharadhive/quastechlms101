import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';
import { getStorage } from '@/lib/adapters/storage';
import { keyBelongsTo, extOf } from '@/lib/utils/files';

const schema = z.object({
  type: z.enum(['VIDEO', 'PDF', 'QUIZ', 'ASSIGNMENT', 'LINK', 'LIVE']),
  title: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
  fileKey: z.string().optional(),      // from /api/uploads (VIDEO/PDF, optional attachment for ASSIGNMENT)
  sizeBytes: z.number().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  isDownloadable: z.boolean().optional(),
  quizSchema: z
    .object({
      timeLimitMin: z.number().positive().optional(),
      attemptsAllowed: z.number().int().positive().default(1),
      shuffle: z.boolean().default(true),
      showAnswers: z.boolean().default(false),
      questions: z.array(
        z.object({
          id: z.string(),
          text: z.string().min(1),
          options: z.array(z.string()).min(2),
          correct: z.array(z.number().int().nonnegative()).min(1),
          marks: z.number().positive().default(1),
          negative: z.number().nonnegative().default(0),
        }),
      ).min(1),
    })
    .optional(),
  assignment: z
    .object({
      instructions: z.string().max(5000).optional(),
      dueAt: z.string().datetime().optional(),
      maxMarks: z.number().positive().optional(),
    })
    .optional(),
  externalUrl: z.string().url().optional(), // LINK / LIVE
});

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { sectionId: ctx.params.id });
  const data = await parseBody(req, schema);
  const sectionId = ctx.params.id;

  if (data.type === 'VIDEO' && !data.fileKey) throw badRequest('Upload the video file first');
  if (data.type === 'PDF' && !data.fileKey) throw badRequest('Upload the PDF file first');
  if (data.type === 'QUIZ' && !data.quizSchema) throw badRequest('Add at least one question to the quiz');
  if (data.type === 'LINK' && !data.externalUrl) throw badRequest('Enter the link URL');
  if (data.fileKey) {
    if (!keyBelongsTo(session.organizationId, data.fileKey, ['material', 'document']))
      throw badRequest('Invalid file — please upload again');
    if (data.type === 'PDF' && extOf(data.fileKey) !== 'pdf') throw badRequest('Please upload a PDF file');
    if (data.type === 'VIDEO' && extOf(data.fileKey) === 'pdf') throw badRequest('Please upload a video file');
    if (!(await getStorage().exists(data.fileKey))) throw badRequest('Uploaded file not found — please upload again');
  }

  // Quiz questions / assignment details / link URL all ride in the same JSON column
  let meta: any = undefined;
  if (data.type === 'QUIZ') meta = data.quizSchema;
  else if (data.type === 'ASSIGNMENT') meta = data.assignment ?? {};
  else if (data.externalUrl) meta = { url: data.externalUrl };

  const position =
    data.position ?? (await prisma.material.count({ where: { sectionId } }));

  const material = await prisma.material.create({
    data: {
      sectionId,
      type: data.type,
      title: data.title,
      position,
      fileKey: data.fileKey ?? null,
      sizeBytes: data.sizeBytes ? BigInt(Math.round(data.sizeBytes)) : null,
      durationSec: data.durationSec,
      isDownloadable: data.isDownloadable ?? false,
      quizSchema: meta,
      // v1: files are verified in storage above, so lessons go live immediately
      status: 'published',
    },
  });

  return NextResponse.json(
    { material: { ...material, sizeBytes: material.sizeBytes?.toString() ?? null } },
    { status: 201 },
  );
});
