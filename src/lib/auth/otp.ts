import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { unauthorized, ApiError } from '@/lib/utils/errors';
import { getMailer } from '@/lib/adapters/mail';

export type OtpPurpose = 'LOGIN' | 'RESET';
const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

/** Create + email a 6-digit code (max 3 per email per 15 min). Silent when the account doesn't exist. */
export async function sendOtp(email: string, purpose: OtpPurpose) {
  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (!user) return;
  const recent = await prisma.otpCode.count({
    where: { email, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  if (recent >= 3) return;

  const code = crypto.randomInt(100000, 1000000).toString();
  await prisma.otpCode.create({
    data: {
      email,
      purpose,
      codeHash: await bcrypt.hash(code, 8),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    },
  });
  // OTP is sent SYNCHRONOUSLY (never queued) — SRS 12.1 / A.2
  try {
    await getMailer().send({
      to: email,
      subject: purpose === 'RESET' ? 'Your password reset code' : 'Your login code',
      body:
        purpose === 'RESET'
          ? `Hi ${user.name},\nYour password reset code is ${code}. It expires in ${OTP_TTL_MIN} minutes.\nIf you did not ask for this, you can ignore this email.`
          : `Your one-time login code is ${code}. It expires in ${OTP_TTL_MIN} minutes.`,
      meta: { type: `OTP_${purpose}` },
    });
  } catch (err: any) {
    console.error('[otp] email failed:', err?.message ?? err);
    throw new ApiError(503, 'We could not send the email right now. Please try again later or contact your institute.');
  }
}

/** Verify + consume the latest unused code for this purpose. Throws 401 on any failure. */
export async function consumeOtp(email: string, code: string, purpose: OtpPurpose) {
  const otp = await prisma.otpCode.findFirst({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) throw unauthorized('Invalid or expired code');

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw unauthorized('Invalid or expired code');
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
}
