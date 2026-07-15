import { type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { verifyPayload } from '@/lib/utils/sign';

const root = () => path.resolve(process.env.LOCAL_STORAGE_PATH ?? './storage');

/** Streams with HTTP Range support → instant seek (SRS 12.5). R2 handles this natively in prod. */
export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  const p = verifyPayload<{ key: string; op: string }>(ctx.params.token);
  if (!p || p.op !== 'get') return new Response('Expired', { status: 403 });

  const filePath = path.resolve(root(), p.key);
  if (!filePath.startsWith(root())) return new Response('Invalid', { status: 400 });

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const range = req.headers.get('range');
  const fh = await fs.open(filePath, 'r');
  try {
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      const chunk = Buffer.alloc(end - start + 1);
      await fh.read(chunk, 0, chunk.length, start);
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunk.length),
        },
      });
    }
    const data = await fh.readFile();
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Length': String(stat.size), 'Accept-Ranges': 'bytes' },
    });
  } finally {
    await fh.close();
  }
}
