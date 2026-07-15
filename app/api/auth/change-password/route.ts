import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession } from '@/lib/auth/session';
import { revokeAllForUser } from '@/lib/auth/tokens';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Minimum 8 characters'),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { currentPassword, newPassword } = await parseBody(req, schema);

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw unauthorized();

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw unauthorized('Current password is incorrect');

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false },
  });
  await revokeAllForUser(user.id); // other devices must re-login
  return NextResponse.json({ ok: true });
});

