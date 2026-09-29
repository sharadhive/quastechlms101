import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';
import { keyBelongsTo } from '@/lib/utils/files';

const schema = z.object({ key: z.string().min(5) });

/** Finalize: verify the object actually landed in storage. Caller then attaches the key. */
export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { key } = await parseBody(req, schema);
  if (!keyBelongsTo(session.organizationId, key)) throw badRequest('Invalid upload key');
  const ok = await getStorage().exists(key);
  if (!ok) throw badRequest('Upload not found in storage — please upload again');
  return NextResponse.json({ ok: true, key });
});
