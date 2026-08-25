import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

/**
 * GET /api/notes/batch?batchId=xxx
 * Instructor-only: returns all student notes for a batch they're assigned to.
 * Read-only — instructors cannot edit/delete student notes.
 */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['INSTRUCTOR']);
  const batchId = req.nextUrl.searchParams.get('batchId');
  if (!batchId) throw badRequest('batchId is required');

  // Verify instructor owns this batch
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, instructorId: session.userId },
    select: { id: true, name: true, courseId: true, course: { select: { title: true } } },
  });
  if (!batch) throw notFound('Batch not found or not assigned to you');

  // Get all enrolled student IDs in this batch
  const enrollments = await prisma.enrollment.findMany({
    where: { batchId, status: 'ACTIVE' },
    select: { id: true, learnerId: true, learner: { select: { id: true, name: true } } },
  });
  const learnerIds = enrollments.map((e) => e.learnerId);
  const enrollmentIds = enrollments.map((e) => e.id);

  if (learnerIds.length === 0) {
    return NextResponse.json({ batch: { id: batch.id, name: batch.name, course: batch.course.title }, notes: [] });
  }

  // Get all notes from these students for materials in this course
  // Find all materialIds belonging to this course
  const materials = await prisma.material.findMany({
    where: {
      section: {
        module: {
          courseModules: { some: { courseId: batch.courseId } },
        },
      },
    },
    select: { id: true, title: true, type: true },
  });
  const materialIds = materials.map((m) => m.id);
  const materialMap = new Map(materials.map((m) => [m.id, { title: m.title, type: m.type }]));

  const notes = await prisma.lessonNote.findMany({
    where: {
      userId: { in: learnerIds },
      materialId: { in: materialIds },
      enrollmentId: { in: enrollmentIds },
    },
    orderBy: [{ materialId: 'asc' }, { timestampSec: 'asc' }],
  });

  // Build learner name map
  const learnerMap = new Map(enrollments.map((e) => [e.learnerId, e.learner.name]));

  const enriched = notes.map((n) => ({
    id: n.id,
    studentName: learnerMap.get(n.userId) ?? 'Learner',
    studentId: n.userId,
    materialTitle: materialMap.get(n.materialId)?.title ?? 'Unknown',
    materialType: materialMap.get(n.materialId)?.type ?? 'UNKNOWN',
    materialId: n.materialId,
    content: n.content,
    timestampSec: n.timestampSec,
    createdAt: n.createdAt,
  }));

  return NextResponse.json({
    batch: { id: batch.id, name: batch.name, course: batch.course.title },
    notes: enriched,
  });
});
