export interface PresignedUpload {
  url: string;
  method: 'PUT';
  key: string;
  expiresInSec: number;
  /** When set, the client uploads in pieces of this size (resumable). */
  chunkSize?: number;
}

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** ttlSec: how long the upload link stays valid (default 6 h; live class recordings use 24 h). */
  presignPut(key: string, contentType: string, maxBytes: number, ttlSec?: number): Promise<PresignedUpload>;
  /** Short-lived URL for playback/download. Relative for the local driver so it works on any host. */
  signedGetUrl(key: string, ttlSec: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

import { localDriver } from './local';
import { s3Driver } from './s3';

/**
 * Returns the active storage driver.
 *
 * Priority:
 *  1. If STORAGE_DRIVER env var is explicitly set to 's3' → use S3/R2 always.
 *  2. If STORAGE_DRIVER is 'auto' (or unset) → check whether the admin panel has
 *     an active STORAGE_S3 integration. If yes → S3. If no → local disk.
 *  3. If STORAGE_DRIVER is 'local' → always use local disk.
 *
 * The 'auto' mode is the default: when no cloud storage is configured, everything
 * works on local disk. The moment an admin activates the S3 integration in the panel,
 * new uploads start going to R2/S3 automatically — zero code changes needed.
 */
export function getStorage(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  switch (driver) {
    case 'local':
      return localDriver;
    case 's3':
    case 'r2':
      return s3Driver;
    case 'auto':
      // Auto mode: we return a proxy that lazily checks the integration.
      // For synchronous code paths that just need the interface, this works seamlessly.
      return autoDriver;
    default:
      throw new Error(`STORAGE_DRIVER "${driver}" not supported. Use "local", "s3", "r2" or "auto".`);
  }
}

/**
 * Checks whether the STORAGE_S3 integration is active in the admin panel.
 * Cached for 30s by the integration store, so this is cheap.
 */
export async function isCloudStorageActive(): Promise<boolean> {
  const { getActiveIntegration } = await import('@/lib/integrations/store');
  const cfg = await getActiveIntegration('STORAGE_S3');
  return !!(cfg?.endpoint && cfg?.bucket && cfg?.accessKeyId && cfg?.secretAccessKey);
}

/**
 * Auto driver: delegates to S3 if the integration is active, otherwise local.
 * Every method is async anyway, so the extra check adds negligible overhead.
 */
const autoDriver: StorageDriver = {
  async put(key, data, contentType) {
    const d = (await isCloudStorageActive()) ? s3Driver : localDriver;
    return d.put(key, data, contentType);
  },
  async get(key) {
    const d = (await isCloudStorageActive()) ? s3Driver : localDriver;
    return d.get(key);
  },
  async delete(key) {
    const d = (await isCloudStorageActive()) ? s3Driver : localDriver;
    return d.delete(key);
  },
  async presignPut(key, contentType, maxBytes, ttlSec) {
    const d = (await isCloudStorageActive()) ? s3Driver : localDriver;
    return d.presignPut(key, contentType, maxBytes, ttlSec);
  },
  async signedGetUrl(key, ttlSec) {
    const d = (await isCloudStorageActive()) ? s3Driver : localDriver;
    return d.signedGetUrl(key, ttlSec);
  },
  async exists(key) {
    const d = (await isCloudStorageActive()) ? s3Driver : localDriver;
    return d.exists(key);
  },
};
