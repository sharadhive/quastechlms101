import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({ key: z.string().min(5) });

/** Finalize: verify the object actually landed in storage. Caller then attaches the key. */
export const POST = withHandler(async (req: NextRequest) => {
  await requireSession(req);
  const { key } = await parseBody(req, schema);
  const ok = await getStorage().exists(key);
  if (!ok) throw badRequest('Upload not found in storage');
  return NextResponse.json({ ok: true, key });
});

