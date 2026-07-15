import crypto from 'crypto';

/**
 * Secrets (SMTP passwords, API keys…) are encrypted before they touch the database.
 * Key = SHA-256 of ENCRYPTION_KEY (or JWT_SECRET as fallback), so no extra setup is needed.
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (raw.length < 16) throw new Error('ENCRYPTION_KEY / JWT_SECRET missing or too short');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptJson(data: Record<string, unknown>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptJson<T = Record<string, string>>(blob: string): T {
  if (!blob) return {} as T;
  const [v, ivB, tagB, dataB] = blob.split('.');
  if (v !== 'v1') throw new Error('Unsupported secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}

/** "abcd1234efgh" → "abcd••••••gh" — safe to show in the UI. */
export function mask(value?: string): string {
  if (!value) return '';
  if (value.length <= 6) return '••••••';
  return `${value.slice(0, 3)}${'•'.repeat(Math.min(10, value.length - 5))}${value.slice(-2)}`;
}
