import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, badRequest, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { signAccessToken } from '@/lib/auth/jwt';
import { issueRefreshToken } from '@/lib/auth/tokens';
import { setAuthCookies } from '@/lib/auth/session';

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(6, 'Phone must be at least 6 digits').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  location: z.string().optional(),
  education: z.string().optional(),
  collegeName: z.string().optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const data = await parseBody(req, schema);

  // Check if org exists
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) throw badRequest('Organization not found');

  // Check for duplicate email
  const existing = await prisma.user.findFirst({
    where: { organizationId: ORG_ID, email: data.email },
  });
  if (existing) throw conflict('An account with this email already exists. Please login instead.');

  // Auto-create location & college in DB if provided and not already present
  if (data.location?.trim()) {
    await prisma.location.upsert({
      where: { organizationId_name: { organizationId: ORG_ID, name: data.location.trim() } },
      update: {},
      create: { organizationId: ORG_ID, name: data.location.trim() },
    });
  }
  if (data.collegeName?.trim()) {
    await prisma.college.upsert({
      where: { organizationId_name: { organizationId: ORG_ID, name: data.collegeName.trim() } },
      update: {},
      create: { organizationId: ORG_ID, name: data.collegeName.trim() },
    });
  }

  // Build profile with extra registration fields + studentType marker
  const profile: Record<string, string> = { studentType: 'EXTERNAL' };
  if (data.location) profile.location = data.location;
  if (data.education) profile.education = data.education;
  if (data.collegeName) profile.collegeName = data.collegeName;

  // Create student user
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      organizationId: ORG_ID,
      role: 'STUDENT',
      lifecycle: 'LEAD',
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      mustChangePassword: false,
      profile: profile as any,
    },
  });

  // Auto-login: issue tokens
  const session = {
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    branchId: user.branchId,
  };
  const access = await signAccessToken(session);
  const refresh = await issueRefreshToken(user.id);

  const res = NextResponse.json({
    role: user.role,
    name: user.name,
    mustChangePassword: false,
  }, { status: 201 });

  return setAuthCookies(res, access, refresh.raw, refresh.maxAgeSec);
});
