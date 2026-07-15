import type { NextRequest } from 'next/server';
import type { Role } from '@prisma/client';
import { requireSession } from './session';
import type { SessionPayload } from './jwt';
import { forbidden } from '@/lib/utils/errors';

/** middleware order: verifyJwt → rbac(allowedRoles) → scope injector → handler */
export async function requireRole(req: NextRequest, allowed: Role[]): Promise<SessionPayload> {
  const session = await requireSession(req);
  if (!allowed.includes(session.role)) throw forbidden();
  return session;
}

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'];

/**
 * Mandatory Prisma `where` fragment merged into every tenant query.
 * BRANCH_ADMIN is automatically confined to their branch.
 * There is no code path that queries without scope.
 */
export function tenantScope(session: SessionPayload): { organizationId: string; branchId?: string } {
  const scope: { organizationId: string; branchId?: string } = {
    organizationId: session.organizationId,
  };
  if (session.role === 'BRANCH_ADMIN' && session.branchId) scope.branchId = session.branchId;
  return scope;
}

/** For querying User rows (learners/team) under the caller's scope. */
export function userScope(session: SessionPayload) {
  return tenantScope(session);
}
