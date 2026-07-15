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
  code: z.string().length(6),
});
const MAX_ATTEMPTS = 5;

export const POST = withHandler(async (req: NextRequest) => {
  const { email, code } = await parseBody(req, schema);

  const otp = await prisma.otpCode.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) throw unauthorized('Invalid or expired code');

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw unauthorized('Invalid or expired code');
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) throw unauthorized('Invalid or expired code');

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

