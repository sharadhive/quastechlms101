import { promises as fs } from 'fs';
import path from 'path';
import type { StorageDriver } from './index';
import { signPayload } from '@/lib/utils/sign';

const root = () => path.resolve(process.env.LOCAL_STORAGE_PATH ?? './storage');
const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

function safePath(key: string) {
  const p = path.resolve(root(), key);
  if (!p.startsWith(root())) throw new Error('Invalid storage key');
  return p;
}

export const localDriver: StorageDriver = {
  async put(key, data) {
    const p = safePath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    return key;
  },
  async get(key) {
    return fs.readFile(safePath(key));
  },
  async delete(key) {
    await fs.rm(safePath(key), { force: true });
  },
  async presignPut(key, contentType, maxBytes) {
    const ttl = 3600;
    const token = signPayload({ key, contentType, maxBytes, op: 'put' }, ttl);
    return { url: `${appUrl()}/api/uploads/local/${token}`, method: 'PUT', key, expiresInSec: ttl };
  },
  async signedGetUrl(key, ttlSec) {
    const token = signPayload({ key, op: 'get' }, ttlSec);
    return `${appUrl()}/api/stream/${token}`;
  },
  async exists(key) {
    try {
      await fs.access(safePath(key));
      return true;
    } catch {
      return false;
    }
  },
};