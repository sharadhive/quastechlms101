import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { signAccessToken } from '@/lib/auth/jwt';
import { issueRefreshToken } from '@/lib/auth/tokens';
import { setAuthCookies } from '@/lib/auth/session';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MAX_FAILS = 5;
const LOCK_MIN = 15;

export const POST = withHandler(async (req: NextRequest) => {
  const { email, password } = await parseBody(req, schema);

  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) throw unauthorized('Invalid credentials');

  if (user.lockedUntil && user.lockedUntil > new Date())
    throw unauthorized('Account temporarily locked. Try again later.');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const fails = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: fails,
        lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000) : null,
      },
    });
    throw unauthorized('Invalid credentials');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

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
    mustChangePassword: user.mustChangePassword,
  });
  return setAuthCookies(res, access, refresh.raw, refresh.maxAgeSec);
});

