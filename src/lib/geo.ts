import { prisma } from '@/lib/prisma';

export interface GeoQuery { state?: string; city?: string; branchId?: string; }

/**
 * Turns State → City → Branch filters into a concrete branch-id list.
 * Returns `undefined` when no geo filter applies (= no restriction).
 * A BRANCH_ADMIN is always pinned to their own branch, whatever they send.
 */
export async function resolveBranchIds(
  organizationId: string,
  geo: GeoQuery,
  scopedBranchId?: string | null,
): Promise<string[] | undefined> {
  if (scopedBranchId) return [scopedBranchId]; // branch admin — hard scope
  if (geo.branchId) return [geo.branchId];
  if (!geo.state && !geo.city) return undefined;

  const branches = await prisma.branch.findMany({
    where: {
      organizationId,
      ...(geo.state ? { state: geo.state } : {}),
      ...(geo.city ? { city: geo.city } : {}),
    },
    select: { id: true },
  });
  return branches.map((b) => b.id);
}

/** Reads state/city/branchId straight off the request query string. */
export function geoFromParams(sp: URLSearchParams): GeoQuery {
  return {
    state: sp.get('state') || undefined,
    city: sp.get('city') || undefined,
    branchId: sp.get('branchId') || undefined,
  };
}
