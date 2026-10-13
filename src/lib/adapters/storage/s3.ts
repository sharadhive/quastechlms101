import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageDriver, PresignedUpload } from './index';

/**
 * S3-compatible storage driver for Cloudflare R2, AWS S3, MinIO, etc.
 * Configuration is read from the active STORAGE_S3 integration (admin panel).
 * When the browser uploads directly to R2 via a presigned PUT URL, no server
 * bandwidth is consumed — exactly what you want for multi-GB video files.
 */

interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

let cachedClient: { client: S3Client; bucket: string; at: number } | null = null;
const CLIENT_TTL = 60_000; // rebuild client every 60s if config changes

async function getS3(): Promise<{ client: S3Client; bucket: string }> {
  if (cachedClient && Date.now() - cachedClient.at < CLIENT_TTL) return cachedClient;

  // Lazy import to avoid circular dependency at module-load time
  const { getActiveIntegration } = await import('@/lib/integrations/store');
  const cfg = await getActiveIntegration('STORAGE_S3') as S3Config | null;

  if (!cfg?.endpoint || !cfg?.bucket || !cfg?.accessKeyId || !cfg?.secretAccessKey) {
    throw new Error(
      'Cloud storage (S3/R2) is not configured. Go to Super Admin → Integrations → Cloud Storage and add your credentials.',
    );
  }

  const client = new S3Client({
    endpoint: cfg.endpoint.replace(/\/+$/, ''),
    region: cfg.region || 'auto',
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true, // required for R2 and most S3-compatible stores
  });

  cachedClient = { client, bucket: cfg.bucket, at: Date.now() };
  return cachedClient;
}

/** Invalidate the cached client (called when the integration config changes). */
export function resetS3Client() {
  cachedClient = null;
}

export const s3Driver: StorageDriver = {
  async put(key, data, contentType) {
    const { client, bucket } = await getS3();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }));
    return key;
  },

  async get(key) {
    const { client, bucket } = await getS3();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  },

  async delete(key) {
    const { client, bucket } = await getS3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  /**
   * Returns a presigned PUT URL so the browser uploads directly to R2/S3.
   * No server bandwidth consumed — the biggest benefit of cloud storage.
   */
  async presignPut(key, contentType, _maxBytes, ttlSec = 6 * 3600) {
    const { client, bucket } = await getS3();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: ttlSec },
    );
    return {
      url,
      method: 'PUT' as const,
      key,
      expiresInSec: ttlSec,
      // No chunkSize — S3/R2 handles the upload in one shot (up to 5 GB).
      // For files > 5 GB, multipart upload would be needed (future enhancement).
    } satisfies PresignedUpload;
  },

  /** Short-lived signed GET URL for video playback / file download. */
  async signedGetUrl(key, ttlSec) {
    const { client, bucket } = await getS3();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: ttlSec },
    );
  },

  async exists(key) {
    const { client, bucket } = await getS3();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  },
};
