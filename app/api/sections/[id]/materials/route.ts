import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';
import { getStorage } from '@/lib/adapters/storage';
import { keyBelongsTo, extOf } from '@/lib/utils/files';
import { enqueue } from '@/lib/jobs/queue';

const schema = z.object({
  type: z.enum(['VIDEO', 'PDF', 'QUIZ', 'ASSIGNMENT', 'LINK', 'LIVE', 'YOUTUBE']),
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
  if (data.type === 'YOUTUBE' && !data.externalUrl) throw badRequest('Enter the YouTube video URL');
  if (data.type === 'YOUTUBE' && data.externalUrl) {
    const ytMatch = data.externalUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
    if (!ytMatch) throw badRequest('Invalid YouTube URL — please paste a valid YouTube video link');
  }
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
  // For YOUTUBE, also store the extracted video ID for easy embed
  if (data.type === 'YOUTUBE' && data.externalUrl) {
    const ytMatch = data.externalUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
    if (ytMatch) meta = { url: data.externalUrl, youtubeId: ytMatch[1] };
  }

  const position =
    data.position ?? (await prisma.material.count({ where: { sectionId } }));

  // Videos: MP4/M4V files are already browser-ready → publish immediately (like recordings).
  // Non-MP4 video formats (WebM, MOV, MKV) need FFmpeg transcoding → start as 'processing'.
  // PDFs and everything else publish immediately.
  const isVideo = data.type === 'VIDEO' && data.fileKey;
  const videoExt = isVideo ? (extOf(data.fileKey!) ?? '').toLowerCase() : '';
  const needsTranscode = isVideo && !['mp4', 'm4v'].includes(videoExt);

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
      status: needsTranscode ? 'processing' : 'published',
    },
  });

  // Enqueue FFmpeg transcode job only for non-MP4 video formats that need conversion
  if (needsTranscode) {
    await enqueue('VIDEO_TRANSCODE', {
      materialId: material.id,
      organizationId: session.organizationId,
      fileKey: data.fileKey!,
    });
  }

  return NextResponse.json(
    { material: { ...material, sizeBytes: material.sizeBytes?.toString() ?? null } },
    { status: 201 },
  );
});
