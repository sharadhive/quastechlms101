import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';

const schema = z
  .object({
    moduleId: z.string().min(1).optional(), // clone an existing library module into this course
    title: z.string().min(2).optional(),    // …or create a brand-new empty module
    position: z.number().int().nonnegative().optional(),
  })
  .refine((d) => d.moduleId || d.title, { message: 'Give a module title or pick one from the library' });

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { courseId: ctx.params.id });
  const data = await parseBody(req, schema);
  const courseId = ctx.params.id;

  let moduleId: string;

  if (data.moduleId) {
    // ── Clone the existing module so this course gets its own independent copy ──
    const source = await prisma.module.findFirst({
      where: { id: data.moduleId, organizationId: session.organizationId },
      include: {
        sections: {
          orderBy: { position: 'asc' },
          include: {
            materials: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (!source) throw notFound('Module not found');

    // Create a deep clone inside a transaction so it's all-or-nothing
    const cloned = await prisma.$transaction(async (tx) => {
      // 1. Clone the Module record
      const newModule = await tx.module.create({
        data: {
          title: source.title,
          organizationId: session.organizationId,
        },
      });

      // 2. Clone each Section and its Materials
      for (const section of source.sections) {
        const newSection = await tx.section.create({
          data: {
            moduleId: newModule.id,
            title: section.title,
            position: section.position,
          },
        });

        // 3. Clone each Material in this section
        for (const mat of section.materials) {
          await tx.material.create({
            data: {
              sectionId: newSection.id,
              type: mat.type,
              title: mat.title,
              fileKey: mat.fileKey,
              sizeBytes: mat.sizeBytes,
              durationSec: mat.durationSec,
              status: mat.status,
              position: mat.position,
              isDownloadable: mat.isDownloadable,
              quizSchema: mat.quizSchema ?? undefined,
            },
          });
        }
      }

      return newModule;
    });

    moduleId = cloned.id;
  } else {
    // ── Brand-new empty module ──
    const mod = await prisma.module.create({
      data: { title: data.title!, organizationId: session.organizationId },
    });
    moduleId = mod.id;
  }

  // Calculate safe position at the end
  const maxPos = await prisma.courseModule.aggregate({ where: { courseId }, _max: { position: true } });
  const position = data.position ?? ((maxPos._max.position ?? -1) + 1);

  // Link the (cloned or new) module to THIS course only
  const existing = await prisma.courseModule.findUnique({ where: { courseId_moduleId: { courseId, moduleId } } });
  if (existing) throw badRequest('This module is already in the course');
  const link = await prisma.courseModule.create({ data: { courseId, moduleId, position } });

  return NextResponse.json({ link, moduleId }, { status: 201 });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const moduleId = req.nextUrl.searchParams.get('moduleId');
  if (!moduleId) throw notFound('moduleId required');
  await assertCanEditContent(session, { courseId: ctx.params.id });
  await prisma.courseModule.deleteMany({ where: { courseId: ctx.params.id, moduleId } });
  return NextResponse.json({ ok: true });
});
