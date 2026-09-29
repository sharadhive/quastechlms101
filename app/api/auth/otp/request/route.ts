import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { sendOtp } from '@/lib/auth/otp';

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(['LOGIN', 'RESET']).default('LOGIN'),
});

/** Always responds identically — never reveals whether the account exists. */
export const POST = withHandler(async (req: NextRequest) => {
  const { email, purpose } = await parseBody(req, schema);
  await sendOtp(email, purpose);
  return NextResponse.json({ ok: true });
});
