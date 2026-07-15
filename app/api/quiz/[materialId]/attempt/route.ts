import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

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
        learnerId: session.userId,
        status: 'ACTIVE',
        course: { courseModules: { some: { moduleId: material.section.moduleId } } },
      },
    });
    if (!enrollment) throw forbidden('Not enrolled');

    const quiz = material.quizSchema as any;
    const existing = await prisma.submission.findUnique({
      where: { materialId_learnerId: { materialId: material.id, learnerId: session.userId } },
    });
    if (existing && existing.attemptsUsed >= (quiz.attemptsAllowed ?? 1) && existing.status !== 'IN_PROGRESS')
      throw forbidden('No attempts remaining');

    const submission = await prisma.submission.upsert({
      where: { materialId_learnerId: { materialId: material.id, learnerId: session.userId } },
      update: { status: 'IN_PROGRESS', startedAt: new Date(), answers: undefined },
      create: {
        materialId: material.id,
        learnerId: session.userId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    // Correct answers NEVER leave the server (SRS 12.7)
    let questions = (quiz.questions as any[]).map(({ correct, ...q }) => q);
    if (quiz.shuffle) questions = seededShuffle(questions, submission.id);

    return NextResponse.json({
      submissionId: submission.id,
      timeLimitMin: quiz.timeLimitMin ?? null,
      attemptsAllowed: quiz.attemptsAllowed ?? 1,
      attemptsUsed: submission.attemptsUsed,
      questions,
    });
  },
);
