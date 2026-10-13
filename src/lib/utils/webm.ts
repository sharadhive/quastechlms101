import { promises as fs } from 'fs';
import { localPath } from '@/lib/adapters/storage/local';

/**
 * Browser recordings (MediaRecorder) have no length in their header, so players can't seek in them.
 * The class recorder reserves an 8-byte Duration field at the start of the file while recording
 * (src/lib/client/webmDuration.ts); once the class ends the real length is written into it here.
 * Only touches the file when the exact placeholder is found. Returns true when written.
 */
export async function writeWebmDuration(key: string, offset: number, durationMs: number): Promise<boolean> {
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') return false;
  if (!Number.isInteger(offset) || offset < 3 || offset > 64 * 1024) return false;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
  const fh = await fs.open(localPath(key), 'r+');
  try {
    const magic = Buffer.alloc(4);
    await fh.read(magic, 0, 4, 0);
    if (magic.readUInt32BE(0) !== 0x1a45dfa3) return false; // not a WebM/Matroska file
    const head = Buffer.alloc(3);
    await fh.read(head, 0, 3, offset - 3);
    if (head[0] !== 0x44 || head[1] !== 0x89 || head[2] !== 0x88) return false; // Duration, 8-byte float
    const value = Buffer.alloc(8);
    value.writeDoubleBE(durationMs, 0); // TimecodeScale is 1 ms in browser recordings
    await fh.write(value, 0, 8, offset);
    return true;
  } finally {
    await fh.close();
  }
}
