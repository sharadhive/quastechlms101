import type { EnrollStatus, Prisma } from '@prisma/client';

/**
 * Enrollments that still "belong" to the learner.
 * COMPLETED learners keep watching their course, stay on the batch roster and in reports —
 * finishing the videos early must never lock a student out or hide them from attendance.
 */
export const LIVE_STATUSES: EnrollStatus[] = ['ACTIVE', 'COMPLETED'];

/** Prisma filter: live enrollment whose access has not expired. */
export function accessibleEnrollment(learnerId: string): Prisma.EnrollmentWhereInput {
  return {
    learnerId,
    status: { in: LIVE_STATUSES },
    OR: [{ accessExpiry: null }, { accessExpiry: { gt: new Date() } }],
  };
}
