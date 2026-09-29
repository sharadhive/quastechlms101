import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(
  async (req: NextRequest, ctx: { params: { enrollmentId: string } }) => {
    const session = await requireRole(req, ['STUDENT']);

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: ctx.params.enrollmentId,
        learnerId: session.userId, // own data only — RBAC matrix
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      include: {
        course: {
          include: {
            courseModules: {
              orderBy: { position: 'asc' },
              include: {
                module: {
                  include: {
                    sections: {
                      orderBy: { position: 'asc' },
                      include: {
                        materials: {
                          where: { status: 'published' },
                          orderBy: { position: 'asc' },
                          select: {
                            id: true, type: true, title: true, position: true,
                            durationSec: true, isDownloadable: true, quizSchema: true,
                            // fileKey intentionally NOT exposed; quizSchema stripped below
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!enrollment) throw notFound('Enrollment not found');

    const progress = await prisma.materialProgress.findMany({
      where: { enrollmentId: enrollment.id },
      select: { materialId: true, completedAt: true },
    });

    // My quiz / assignment status per lesson
    const course: any = enrollment.course;
    const allIds: string[] = [];
    for (const cm of course.courseModules) for (const sec of cm.module.sections) for (const m of sec.materials) allIds.push(m.id);
    const subs = await prisma.submission.findMany({
      where: { learnerId: session.userId, materialId: { in: allIds } },
      select: { materialId: true, status: true, marks: true, attemptsUsed: true, isLate: true, feedback: true },
    });
    const subMap = new Map(subs.map((s) => [s.materialId, s]));

    // Strip quiz answer keys (SRS 12.7) — expose only what the player needs per lesson type
    for (const cm of course.courseModules)
      for (const sec of cm.module.sections)
        sec.materials = sec.materials.map((m: any) => {
          const { quizSchema, ...rest } = m;
          const q = (quizSchema ?? {}) as any;
          const sub = subMap.get(m.id);
          const mine = sub
            ? { status: sub.status, attemptsUsed: sub.attemptsUsed, isLate: sub.isLate,
                marks: sub.status === 'PUBLISHED' ? sub.marks : null, feedback: sub.status === 'PUBLISHED' ? sub.feedback : null }
            : null;
          if (m.type === 'LINK' || m.type === 'LIVE') return { ...rest, externalUrl: q.url ?? null };
          if (m.type === 'ASSIGNMENT')
            return { ...rest, assignment: { instructions: q.instructions ?? null, dueAt: q.dueAt ?? null, maxMarks: q.maxMarks ?? null }, mine };
          if (m.type === 'QUIZ')
            return { ...rest, quizInfo: { questions: q.questions?.length ?? 0, timeLimitMin: q.timeLimitMin ?? null, attemptsAllowed: q.attemptsAllowed ?? 1 }, mine };
          return rest;
        });

    return NextResponse.json({
      enrollment: {
        id: enrollment.id, status: enrollment.status, progressPct: enrollment.progressPct,
        accessExpiry: enrollment.accessExpiry,
      },
      course,
      completed: progress,
    });
  },
);
