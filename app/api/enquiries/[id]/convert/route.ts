import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { generateTempPassword } from '@/lib/auth/passwords';
import { enqueue } from '@/lib/jobs/queue';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, conflict } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

/**
 * POST /api/enquiries/[id]/convert
 * Converts an enquiry into a learner (User with role STUDENT).
 * Returns the new learner record + temp password.
 */
export const POST = withHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const { id } = await params;

  const enquiry = await prisma.enquiry.findFirst({
    where: { id, organizationId: scope.organizationId },
  });
  if (!enquiry) throw notFound('Enquiry not found');

  // If the enquiry has an email, check if a learner with that email already exists
  if (enquiry.email) {
    const existing = await prisma.user.findFirst({
      where: { organizationId: scope.organizationId, email: enquiry.email, role: 'STUDENT' },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (existing) {
      // Learner already exists — just return them without creating a duplicate
      return NextResponse.json({ learner: existing, alreadyExists: true });
    }
  }

  // Need at least an email to create a user account
  if (!enquiry.email) {
    // Generate a placeholder email from phone + org if no email
    const placeholderEmail = `${enquiry.phone ?? enquiry.id}@placeholder.quastech`;
    enquiry.email = placeholderEmail;
  }

  const branchId =
    session.role === 'BRANCH_ADMIN' ? session.branchId : (enquiry.branchId ?? session.branchId);

  const tempPassword = generateTempPassword();
  const learner = await prisma.user.create({
    data: {
      organizationId: scope.organizationId,
      branchId,
      role: 'STUDENT',
      lifecycle: 'ENQUIRY',
      name: enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
    },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!learner.email.endsWith('@placeholder.quastech'))
    await enqueue('EMAIL_WELCOME', { to: learner.email, name: learner.name, email: learner.email, tempPassword });
  return NextResponse.json({ learner, tempPassword, alreadyExists: false }, { status: 201 });
});
