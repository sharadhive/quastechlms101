import { prisma } from '@/lib/prisma';
import { forbidden, notFound } from '@/lib/utils/errors';
import type { SessionPayload } from './jwt';
import { can } from './permissions';

const ADMINS = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'];

/** Course ids an instructor teaches (has at least one batch in). */
export async function taughtCourseIds(instructorId: string): Promise<string[]> {
  const rows = await prisma.batch.findMany({
    where: { instructorId },
    select: { courseId: true },
    distinct: ['courseId'],
  });
  return rows.map((r) => r.courseId);
}

type Target =
  | { courseId: string }
  | { moduleId: string }
  | { sectionId: string }
  | { materialId: string };

/** Resolve the courses a piece of content belongs to (a library module can be linked to several). */
async function coursesOf(organizationId: string, t: Target): Promise<string[] | null> {
  if ('courseId' in t) {
    const c = await prisma.course.findFirst({ where: { id: t.courseId, organizationId }, select: { id: true } });
    return c ? [c.id] : null;
  }
  let moduleId: string | undefined;
  if ('moduleId' in t) moduleId = t.moduleId;
  if ('sectionId' in t) {
    const s = await prisma.section.findFirst({
      where: { id: t.sectionId, module: { organizationId } },
      select: { moduleId: true },
    });
    moduleId = s?.moduleId;
  }
  if ('materialId' in t) {
    const m = await prisma.material.findFirst({
      where: { id: t.materialId, section: { module: { organizationId } } },
      select: { section: { select: { moduleId: true } } },
    });
    moduleId = m?.section.moduleId;
  }
  if (!moduleId) return null;
  const mod = await prisma.module.findFirst({
    where: { id: moduleId, organizationId },
    select: { courseModules: { select: { courseId: true } } },
  });
  return mod ? mod.courseModules.map((cm) => cm.courseId) : null;
}

/**
 * Who may add/edit lessons, sections and modules:
 *  - Super Admin / Admin / Branch Admin → any course in the organisation
 *  - Instructor → only courses they teach, and only with the "Manage course content" permission
 */
export async function assertCanEditContent(session: SessionPayload, target: Target): Promise<void> {
  const courseIds = await coursesOf(session.organizationId, target);
  if (courseIds === null) throw notFound('Content not found');
  if (ADMINS.includes(session.role)) return;
  if (session.role !== 'INSTRUCTOR') throw forbidden();
  if (!(await can(session, 'manage_content')))
    throw forbidden('Ask an admin to grant you "Manage course content" to edit lessons');
  const mine = new Set(await taughtCourseIds(session.userId));
  if (!courseIds.some((id) => mine.has(id)))
    throw forbidden('You can only edit courses you teach');
}
