import { NextResponse, type NextRequest } from 'next/server';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { withHandler, unauthorized, badRequest } from '@/lib/utils/errors';
import { verifyPayload } from '@/lib/utils/sign';
import { localPath } from '@/lib/adapters/storage/local';

export const dynamic = 'force-dynamic';

/**
 * Local-driver upload target (with S3/R2 the browser uploads to the bucket instead).
 *
 * Resumable + memory-safe:
 *  - the body is streamed straight to disk, never held in RAM;
 *  - large files arrive as several PUTs with `Content-Range: bytes start-end/total`;
 *  - GET on the same URL reports how many bytes were received so a broken upload resumes.
 */
type UploadToken = { key: string; maxBytes: number; op: string };

function decode(token: string): UploadToken {
  const p = verifyPayload<UploadToken>(token);
  if (!p || p.op !== 'put' || typeof p.key !== 'string') throw unauthorized('Upload link expired — please try again');
  return p;
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return -1;
  }
}

/** GET → { received, done } so the client can resume after a network drop. */
export const GET = withHandler(async (_req: NextRequest, ctx: { params: { token: string } }) => {
  const p = decode(ctx.params.token);
  const final = localPath(p.key);
  const done = await sizeOf(final);
  if (done >= 0) return NextResponse.json({ received: done, done: true });
  return NextResponse.json({ received: Math.max(0, await sizeOf(final + '.part')), done: false });
});

export const PUT = withHandler(async (req: NextRequest, ctx: { params: { token: string } }) => {
  const p = decode(ctx.params.token);
  const final = localPath(p.key);
  const part = final + '.part';
  await fs.mkdir(path.dirname(final), { recursive: true });
  if (!req.body) throw badRequest('Empty body');

  // Optional chunk header: "bytes 0-5242879/104857600"
  let start = 0;
  let end: number | null = null;
  let total: number | null = null;
  const cr = req.headers.get('content-range');
  if (cr) {
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr.trim());
    if (!m) throw badRequest('Invalid Content-Range header');
    start = Number(m[1]);
    end = Number(m[2]);
    total = Number(m[3]);
    if (end < start || end >= total) throw badRequest('Invalid Content-Range values');
  }
  if ((total ?? 0) > p.maxBytes) throw badRequest('File is larger than the size declared for this upload');

  // Finished earlier (e.g. the last response was lost) → report success again
  const finalSize = await sizeOf(final);
  if (finalSize >= 0 && (total === null || finalSize === total)) {
    return NextResponse.json({ ok: true, done: true, key: p.key, received: finalSize });
  }

  const current = Math.max(0, await sizeOf(part));
  if (start !== 0 && start !== current) {
    return NextResponse.json(
      { error: 'Chunk out of order — resume from the received offset', received: current },
      { status: 409 },
    );
  }

  const expected = end === null ? null : end - start + 1;
  let count = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      count += chunk.length;
      if ((expected !== null && count > expected) || start + count > p.maxBytes) cb(new Error('TOO_LARGE'));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(req.body as any),
      counter,
      createWriteStream(part, { flags: start === 0 ? 'w' : 'a' }),
    );
  } catch (err: any) {
    await fs.truncate(part, start).catch(() => {});
    if (err?.message === 'TOO_LARGE')
      return NextResponse.json({ error: 'File exceeds the declared size' }, { status: 413 });
    return NextResponse.json({ error: 'Upload interrupted — retrying will resume', received: start }, { status: 400 });
  }

  if (expected !== null && count !== expected) {
    await fs.truncate(part, start).catch(() => {});
    return NextResponse.json({ error: 'Incomplete chunk — please retry', received: start }, { status: 400 });
  }
  const received = start + count;
  if (received === 0) throw badRequest('Empty file');

  if (total === null || received === total) {
    await fs.rename(part, final);
    return NextResponse.json({ ok: true, done: true, key: p.key, received });
  }
  return NextResponse.json({ ok: true, done: false, received });
});
