import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';

const schema = z.object({
  answers: z.record(z.unknown()),
  rating: z.number().int().min(1).max(5).optional(),
  anonymous: z.boolean().default(false),
});

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['STUDENT']);
  const { answers, rating, anonymous } = await parseBody(req, schema);

  const form = await prisma.feedbackForm.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
  });
  if (!form) throw notFound('Form not found');

  const respondentId = anonymous && form.allowAnonymous ? null : session.userId;
  if (respondentId) {
    const dup = await prisma.feedbackResponse.findFirst({
      where: { formId: form.id, respondentId },
    });
    if (dup) throw conflict('Already responded');
  }

  const response = await prisma.feedbackResponse.create({
    data: { formId: form.id, respondentId, answers: answers as any, rating },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: response.id }, { status: 201 });
});
