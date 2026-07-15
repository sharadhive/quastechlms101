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

    // Strip quiz answer keys — only LINK materials keep their URL (SRS 12.7)
    const course: any = enrollment.course;
    for (const cm of course.courseModules)
      for (const sec of cm.module.sections)
        sec.materials = sec.materials.map((m: any) => {
          const { quizSchema, ...rest } = m;
          return m.type === 'LINK' ? { ...rest, externalUrl: quizSchema?.url ?? null } : rest;
        });

    return NextResponse.json({
      enrollment: { id: enrollment.id, status: enrollment.status, progressPct: enrollment.progressPct },
      course,
      completed: progress,
    });
  },
);
