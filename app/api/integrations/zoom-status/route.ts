import { NextResponse, type NextRequest } from 'next/server';
import { withHandler } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { isZoomActive } from '@/lib/integrations/zoom';

/**
 * GET /api/integrations/zoom-status
 * Returns whether the Zoom integration is active for the current organization.
 * Used by the frontend to decide whether to show the manual link field.
 */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const active = await isZoomActive(scope.organizationId);
  return NextResponse.json({ zoomActive: active });
});
