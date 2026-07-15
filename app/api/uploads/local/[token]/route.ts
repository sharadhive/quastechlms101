import { NextResponse, type NextRequest } from 'next/server';
import { withHandler, unauthorized, badRequest } from '@/lib/utils/errors';
import { verifyPayload } from '@/lib/utils/sign';
import { getStorage } from '@/lib/adapters/storage';

/** Local-driver upload target. In production (R2) the browser PUTs to R2 directly instead. */
export const PUT = withHandler(async (req: NextRequest, ctx: { params: { token: string } }) => {
  const p = verifyPayload<{ key: string; maxBytes: number; op: string }>(ctx.params.token);
  if (!p || p.op !== 'put') throw unauthorized('Invalid or expired upload URL');

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) throw badRequest('Empty body');
  if (buf.length > p.maxBytes) throw badRequest('File exceeds declared size');

  await getStorage().put(p.key, buf, req.headers.get('content-type') ?? 'application/octet-stream');
  return NextResponse.json({ ok: true, key: p.key });
});
