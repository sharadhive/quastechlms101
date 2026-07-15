import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { onQuizScored } from '@/lib/gamify';

const schema = z.object({
  answers: z.record(z.array(z.number().int().nonnegative())), // { [questionId]: [selectedIdx,…] }
});

const GRACE_MS = 30_000;

export const POST = withHandler(
  async (req: NextRequest, ctx: { params: { materialId: string } }) => {
    const session = await requireRole(req, ['STUDENT']);
    const { answers } = await parseBody(req, schema);

    const submission = await prisma.submission.findUnique({
      where: {
        materialId_learnerId: { materialId: ctx.params.materialId, learnerId: session.userId },
      },
      include: { material: true },
    });
    if (!submission || submission.status !== 'IN_PROGRESS')
      throw notFound('No active attempt — start the quiz first');

    const quiz = submission.material.quizSchema as any;

    // Timer enforced SERVER-SIDE (SRS 12.7)
    if (quiz.timeLimitMin && submission.startedAt) {
      const deadline = submission.startedAt.getTime() + quiz.timeLimitMin * 60_000 + GRACE_MS;
      if (Date.now() > deadline) throw badRequest('Time limit exceeded');
    }

    // Grade against server-held keys, apply negative marking
    let marks = 0;
    let maxMarks = 0;
    for (const q of quiz.questions as any[]) {
      maxMarks += q.marks ?? 1;
      const given = (answers[q.id] ?? []).slice().sort().join(',');
      const correct = (q.correct as number[]).slice().sort().join(',');
      if (given === correct) marks += q.marks ?? 1;
      else if (given.length > 0) marks -= q.negative ?? 0;
    }
    marks = Math.max(0, Math.round(marks * 100) / 100);

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        answers: answers as any,
        marks: new Prisma.Decimal(marks),
        attemptsUsed: { increment: 1 },
        status: 'PUBLISHED', // auto-graded quizzes publish instantly (SRS 12.7)
      },
    });

    await onQuizScored(session.organizationId, session.userId, marks, maxMarks).catch(() => {});

    return NextResponse.json({
      marks: updated.marks,
      maxMarks,
      // answer review only if course setting allows (SRS 12.7)
      review: quiz.showAnswers ? quiz.questions : undefined,
    });
  },
);
