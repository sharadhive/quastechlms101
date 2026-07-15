import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const createSchema = z.object({
  title: z.string().min(2),
  formSchema: z.object({ fields: z.array(z.record(z.unknown())).min(1) }),
  targetType: z.enum(['SESSION', 'BATCH', 'COURSE']),
  targetId: z.string().min(1),
  allowAnonymous: z.boolean().default(false),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const data = await parseBody(req, createSchema);
  const form = await prisma.feedbackForm.create({
    data: {
      organizationId: session.organizationId,
      title: data.title,
      formSchema: data.formSchema as any,
      targetType: data.targetType,
      targetId: data.targetId,
      allowAnonymous: data.allowAnonymous,
      createdById: session.userId,
    },
  });
  return NextResponse.json({ form }, { status: 201 });
});

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR', 'STUDENT']);
  const sp = req.nextUrl.searchParams;
  const forms = await prisma.feedbackForm.findMany({
    where: {
      organizationId: session.organizationId,
      ...(sp.get('targetType') ? { targetType: sp.get('targetType')! } : {}),
      ...(sp.get('targetId') ? { targetId: sp.get('targetId')! } : {}),
    },
    include: session.role === 'STUDENT' ? undefined : {
      responses: { select: { rating: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  // aggregate rating for staff; strip responses for students
  const shaped = forms.map((f: any) => {
    const ratings = (f.responses ?? []).map((r: any) => r.rating).filter(Boolean);
    const avg = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;
    const { responses, ...rest } = f;
    return { ...rest, responseCount: responses?.length ?? undefined, avgRating: avg ?? undefined };
  });
  return NextResponse.json({ forms: shaped });
});

