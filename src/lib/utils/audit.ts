import { Prisma } from '@prisma/client';

/** Write an audit row INSIDE the caller's transaction (tx) — SRS 12.3. */
export async function audit(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.activityLog.create({
    data: {
      organizationId: params.organizationId,
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: (params.before as Prisma.InputJsonValue) ?? undefined,
      after: (params.after as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
