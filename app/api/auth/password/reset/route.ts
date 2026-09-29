import { type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { consumeOtp } from '@/lib/auth/otp';
import { revokeAllForUser } from '@/lib/auth/tokens';
import { startSession } from '@/lib/auth/session';
import { stripTempPassword } from '@/lib/auth/passwords';

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8, 'Minimum 8 characters'),
});

/** Forgot password: email code → new password → signed in. No current password needed. */
export const POST = withHandler(async (req: NextRequest) => {
  const { email, code, newPassword } = await parseBody(req, schema);
  await consumeOtp(email, code, 'RESET');

  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) throw unauthorized('Invalid or expired code');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      profile: stripTempPassword(user.profile),
    },
  });
  await revokeAllForUser(user.id); // sign out other devices
  return startSession(updated);
});
