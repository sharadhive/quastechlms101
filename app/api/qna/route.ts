import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession } from '@/lib/auth/session';

/** GET /api/qna?courseId=&materialId= — threaded Q&A (merged feature). */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const sp = req.nextUrl.searchParams;
  const courseId = sp.get('courseId');
  const unansweredOnly = sp.get('unanswered') !== null;
  if (!courseId && !unansweredOnly) throw notFound('courseId required');

  let where: any = { parentId: null };
  if (courseId) where.courseId = courseId;
  if (sp.get('materialId')) where.materialId = sp.get('materialId');

  // Instructor "unanswered" queue across own courses
  if (unansweredOnly && session.role === 'INSTRUCTOR') {
    const batches = await prisma.batch.findMany({
      where: { instructorId: session.userId }, select: { courseId: true },
    });
    where = { parentId: null, resolvedAt: null, courseId: { in: batches.map((b) => b.courseId) } };
  }

  const questions = await prisma.courseQnA.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 50,
  });
  const answers = await prisma.courseQnA.findMany({
    where: { parentId: { in: questions.map((q) => q.id) } }, orderBy: { createdAt: 'asc' },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set([...questions, ...answers].map((x) => x.userId))] } },
    select: { id: true, name: true, role: true },
  });
  const umap = new Map(users.map((u) => [u.id, u]));
  const thread = questions.map((q) => ({
    ...q, user: umap.get(q.userId),
    answers: answers.filter((a) => a.parentId === q.id).map((a) => ({ ...a, user: umap.get(a.userId) })),
  }));
  return NextResponse.json({ questions: thread });
});

const schema = z.object({
  courseId: z.string().min(1),
  materialId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(), // set = answering
  content: z.string().min(2),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const data = await parseBody(req, schema);

  if (session.role === 'STUDENT') {
    const enrolled = await prisma.enrollment.findFirst({
      where: { learnerId: session.userId, courseId: data.courseId, status: { in: ['ACTIVE', 'COMPLETED'] } },
    });
    if (!enrolled) throw forbidden('Not enrolled in this course');
  }

  const post = await prisma.courseQnA.create({
    data: { courseId: data.courseId, materialId: data.materialId, userId: session.userId,
      parentId: data.parentId, content: data.content },
  });
  // instructor/admin answering marks question resolved
  if (data.parentId && session.role !== 'STUDENT')
    await prisma.courseQnA.update({ where: { id: data.parentId }, data: { resolvedAt: new Date() } });
  return NextResponse.json({ post }, { status: 201 });
});
