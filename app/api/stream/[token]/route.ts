import { type NextRequest } from 'next/server';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { verifyPayload } from '@/lib/utils/sign';
import { localPath } from '@/lib/adapters/storage/local';
import { mimeFor, isInlineSafe } from '@/lib/utils/files';

export const dynamic = 'force-dynamic';

/**
 * Streams stored files with HTTP Range support.
 *
 * Memory-safe for very large videos: data is piped from disk in small pieces and an
 * open-ended request ("bytes=0-", which every <video> sends first) is answered with at
 * most MAX_OPEN_CHUNK bytes — the browser simply asks for the next piece as it plays.
 */
const MAX_OPEN_CHUNK = 2 * 1024 * 1024; // 2 MB for "bytes=N-"
const MAX_EXPLICIT_CHUNK = 16 * 1024 * 1024; // cap for "bytes=N-M"

function headersFor(key: string, extra: Record<string, string>) {
  const inline = isInlineSafe(key);
  return {
    'Content-Type': inline ? mimeFor(key) : 'application/octet-stream',
    'Content-Disposition': inline ? 'inline' : 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    ...extra,
  };
}

function body(filePath: string, start: number, end: number) {
  const node = createReadStream(filePath, { start, end, highWaterMark: 256 * 1024 });
  return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
}

async function handle(req: NextRequest, token: string, headOnly: boolean) {
  const p = verifyPayload<{ key: string; op: string }>(token);
  if (!p || p.op !== 'get' || typeof p.key !== 'string') return new Response('Link expired', { status: 403 });

  let filePath: string;
  try {
    filePath = localPath(p.key);
  } catch {
    return new Response('Invalid', { status: 400 });
  }

  let size: number;
  try {
    const st = await fs.stat(filePath);
    if (!st.isFile()) throw new Error('not a file');
    size = st.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const range = req.headers.get('range');
  if (!range) {
    const h = headersFor(p.key, { 'Content-Length': String(size) });
    return new Response(headOnly || size === 0 ? null : body(filePath, 0, size - 1), { status: 200, headers: h });
  }

  // Supports "bytes=start-end", "bytes=start-" and suffix "bytes=-N" (first range only)
  const m = /^bytes=(\d*)-(\d*)/.exec(range.trim());
  let start: number;
  let end: number;
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  if (m[1] === '') {
    const suffix = Math.min(parseInt(m[2], 10), size);
    start = size - suffix;
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? start + MAX_OPEN_CHUNK - 1 : Math.min(parseInt(m[2], 10), start + MAX_EXPLICIT_CHUNK - 1);
  }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  const h = headersFor(p.key, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1),
  });
  return new Response(headOnly ? null : body(filePath, start, end), { status: 206, headers: h });
}

export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  return handle(req, ctx.params.token, false);
}

export async function HEAD(req: NextRequest, ctx: { params: { token: string } }) {
  return handle(req, ctx.params.token, true);
}
