import { promises as fs } from 'fs';
import path from 'path';
import type { StorageDriver } from './index';
import { signPayload } from '@/lib/utils/sign';

/** Uploads are sent in 5 MB pieces — small enough for default proxy limits, resumable on bad networks. */
export const LOCAL_UPLOAD_CHUNK = 5 * 1024 * 1024;
const UPLOAD_URL_TTL_SEC = 6 * 3600; // long enough for multi-GB uploads on slow connections

export const storageRoot = () => path.resolve(process.env.LOCAL_STORAGE_PATH ?? './storage');

/** Absolute path for a storage key; refuses anything that escapes the storage root. */
export function localPath(key: string): string {
  const root = storageRoot();
  const p = path.resolve(root, key);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return p;
}

export const localDriver: StorageDriver = {
  async put(key, data) {
    const p = localPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    return key;
  },
  async get(key) {
    return fs.readFile(localPath(key));
  },
  async delete(key) {
    await fs.rm(localPath(key), { force: true });
    await fs.rm(localPath(key) + '.part', { force: true });
  },
  async presignPut(key, contentType, maxBytes) {
    const token = signPayload({ key, contentType, maxBytes, op: 'put' }, UPLOAD_URL_TTL_SEC);
    return {
      url: `/api/uploads/local/${token}`,
      method: 'PUT',
      key,
      expiresInSec: UPLOAD_URL_TTL_SEC,
      chunkSize: LOCAL_UPLOAD_CHUNK,
    };
  },
  async signedGetUrl(key, ttlSec) {
    const token = signPayload({ key, op: 'get' }, ttlSec);
    return `/api/stream/${token}`;
  },
  async exists(key) {
    try {
      const st = await fs.stat(localPath(key));
      return st.isFile();
    } catch {
      return false;
    }
  },
};
