import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { enqueue } from '@/lib/jobs/queue';

const createSchema = z.object({
  name: z.string().min(2),
  subject: z.string().min(2),
  body: z.string().min(2),
  audienceFilter: z.object({
    branchId: z.string().min(1).optional(),
    courseId: z.string().min(1).optional(),
    batchId: z.string().min(1).optional(),
    lifecycle: z.enum(['LEAD', 'ENQUIRY', 'ENROLLED', 'ACTIVE', 'COMPLETED', 'DROPPED']).optional(),
  }),
  scheduledAt: z.string().datetime().optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, createSchema);
  const f = data.audienceFilter;
  if (scope.branchId) f.branchId = scope.branchId; // branch admin cannot broadcast org-wide

  // Resolve recipients (learner audience)
  const recipients = await prisma.user.findMany({
    where: {
      organizationId: scope.organizationId,
      role: 'STUDENT',
      isActive: true,
      ...(f.branchId ? { branchId: f.branchId } : {}),
      ...(f.lifecycle ? { lifecycle: f.lifecycle } : {}),
      ...(f.courseId || f.batchId
        ? {
            enrollments: {
              some: {
                status: 'ACTIVE',
                ...(f.courseId ? { courseId: f.courseId } : {}),
                ...(f.batchId ? { batchId: f.batchId } : {}),
              },
            },
          }
        : {}),
    },
    select: { id: true, email: true, name: true },
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: scope.organizationId,
      name: data.name,
      subject: data.subject,
      body: data.body,
      audienceFilter: f as any,
      status: 'QUEUED',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      recipientCount: recipients.length,
      createdById: session.userId,
    },
  });

  // One job per recipient — worker rate-limits naturally via batch claiming (SRS 12.10)
  const runAt = data.scheduledAt ? new Date(data.scheduledAt) : new Date();
  for (const r of recipients) {
    await enqueue(
      'CAMPAIGN_SEND',
      { campaignId: campaign.id, to: r.email, name: r.name, subject: data.subject, body: data.body },
      runAt,
    );
  }

  return NextResponse.json(
    { campaignId: campaign.id, recipientCount: recipients.length },
    { status: 201 },
  );
});

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ campaigns });
});

