import { type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession, startSession } from '@/lib/auth/session';
import { revokeAllForUser } from '@/lib/auth/tokens';
import { stripTempPassword } from '@/lib/auth/passwords';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Minimum 8 characters'),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { currentPassword, newPassword } = await parseBody(req, schema);
  if (currentPassword === newPassword) throw badRequest('New password must be different from the current one');

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) throw unauthorized();

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw unauthorized('Current password is incorrect');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
      profile: stripTempPassword(user.profile),
    },
  });
  await revokeAllForUser(user.id); // other devices must re-login
  return startSession(updated); // fresh cookies for this device (clears the "must change" flag)
});
