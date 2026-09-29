import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { accessibleEnrollment } from '@/lib/auth/enrollment';

const GRACE_MS = 30_000;

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = parseInt(crypto.createHash('md5').update(seed).digest('hex').slice(0, 8), 16);
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 9301 + 49297) % 233280;
    const j = Math.floor((h / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const POST = withHandler(
  async (req: NextRequest, ctx: { params: { materialId: string } }) => {
    const session = await requireRole(req, ['STUDENT']);

    const material = await prisma.material.findFirst({
      where: { id: ctx.params.materialId, type: 'QUIZ', status: 'published' },
      include: { section: { select: { moduleId: true } } },
    });
    if (!material || !material.quizSchema) throw notFound('Quiz not found');

    // enrollment check (same rule as streaming — SRS 12.5)
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        ...accessibleEnrollment(session.userId),
        course: { courseModules: { some: { moduleId: material.section.moduleId } } },
      },
    });
    if (!enrollment) throw forbidden('Not enrolled');

    const quiz = material.quizSchema as any;
    const allowed = quiz.attemptsAllowed ?? 1;
    let existing = await prisma.submission.findUnique({
      where: { materialId_learnerId: { materialId: material.id, learnerId: session.userId } },
    });

    // An attempt already running: resume it (same timer) — restarting must not reset the clock
    if (existing?.status === 'IN_PROGRESS' && existing.startedAt) {
      const deadline = quiz.timeLimitMin
        ? existing.startedAt.getTime() + quiz.timeLimitMin * 60_000 + GRACE_MS
        : Infinity;
      if (Date.now() <= deadline) {
        return NextResponse.json(payload(existing.id, existing.startedAt, existing.attemptsUsed));
      }
      // Time ran out without submitting → the attempt counts, scored 0
      existing = await prisma.submission.update({
        where: { id: existing.id },
        data: { status: 'PUBLISHED', attemptsUsed: { increment: 1 }, marks: new Prisma.Decimal(0) },
      });
    }

    if (existing && existing.attemptsUsed >= allowed) throw forbidden('No attempts remaining');

    const startedAt = new Date();
    const submission = await prisma.submission.upsert({
      where: { materialId_learnerId: { materialId: material.id, learnerId: session.userId } },
      update: { status: 'IN_PROGRESS', startedAt, answers: Prisma.DbNull },
      create: {
        materialId: material.id,
        learnerId: session.userId,
        status: 'IN_PROGRESS',
        startedAt,
      },
    });
    return NextResponse.json(payload(submission.id, startedAt, submission.attemptsUsed));

    function payload(submissionId: string, started: Date, used: number) {
      // Correct answers NEVER leave the server (SRS 12.7)
      let questions = (quiz.questions as any[]).map(({ correct, ...q }) => q);
      if (quiz.shuffle) questions = seededShuffle(questions, submissionId);
      return {
        submissionId,
        timeLimitMin: quiz.timeLimitMin ?? null,
        startedAt: started,
        endsAt: quiz.timeLimitMin ? new Date(started.getTime() + quiz.timeLimitMin * 60_000) : null,
        attemptsAllowed: allowed,
        attemptsUsed: used,
        questions,
      };
    }
  },
);
