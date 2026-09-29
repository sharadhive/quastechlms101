import { type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { startSession } from '@/lib/auth/session';
import { consumeOtp } from '@/lib/auth/otp';

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

/** Login with a one-time email code. */
export const POST = withHandler(async (req: NextRequest) => {
  const { email, code } = await parseBody(req, schema);
  await consumeOtp(email, code, 'LOGIN');

  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) throw unauthorized('Invalid or expired code');
  return startSession(user);
});
