import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({
  sectionIds: z.array(z.string().min(1)),
});

export const PUT = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const { sectionIds } = await parseBody(req, schema);

  const cls = await prisma.classSession.findFirst({
    where: {
      id: ctx.params.id,
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
      },
    },
  });
  if (!cls) throw notFound('Session not found');

  await prisma.$transaction([
    prisma.sessionTopic.deleteMany({ where: { sessionId: cls.id } }),
    ...sectionIds.map((sectionId) =>
      prisma.sessionTopic.create({ data: { sessionId: cls.id, sectionId } }),
    ),
  ]);

  return NextResponse.json({ ok: true, count: sectionIds.length });
});
