import { getStorage } from '@/lib/adapters/storage';

/**
 * Resolve a storage key to a short-lived signed URL.
 * Returns null when no key is set.
 * Uses a 1-hour TTL — cached in the browser for that window.
 */
export async function thumbnailUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  try {
    return await getStorage().signedGetUrl(key, 3600);
  } catch {
    return null;
  }
}

/**
 * Batch-resolve an array of objects that may have a `thumbnailKey`.
 * Adds a `thumbnailUrl` field to each.
 */
export async function resolveThumbnails<T extends { thumbnailKey?: string | null }>(
  items: T[],
): Promise<(T & { thumbnailUrl: string | null })[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      thumbnailUrl: await thumbnailUrl(item.thumbnailKey),
    })),
  );
}
