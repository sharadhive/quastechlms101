import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { getMailer } from '@/lib/adapters/mail';

const schema = z.object({ email: z.string().email() });
const OTP_TTL_MIN = 5;

export const POST = withHandler(async (req: NextRequest) => {
  const { email } = await parseBody(req, schema);

  // Always respond identically — do not reveal whether the account exists.
  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (user) {
    // basic per-email throttle: max 3 codes per 15 min
    const recent = await prisma.otpCode.count({
      where: { email, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
    });
    if (recent < 3) {
      const code = crypto.randomInt(100000, 1000000).toString();
      await prisma.otpCode.create({
        data: {
          email,
          codeHash: await bcrypt.hash(code, 8),
          expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
        },
      });
      // OTP is sent SYNCHRONOUSLY (never queued) — SRS 12.1 / A.2
      await getMailer().send({
        to: email,
        subject: 'Your login code',
        body: `Your one-time login code is ${code}. It expires in ${OTP_TTL_MIN} minutes.`,
        meta: { type: 'OTP' },
      });
    }
  }
  return NextResponse.json({ ok: true });
});

