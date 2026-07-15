export interface PresignedUpload {
  url: string;
  method: 'PUT';
  key: string;
  expiresInSec: number;
}

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  presignPut(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;
  signedGetUrl(key: string, ttlSec: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

import { localDriver } from './local';

export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  switch (driver) {
    case 'local':
      return localDriver;
    default:
      throw new Error(`STORAGE_DRIVER "${driver}" not implemented yet`);
  }
}