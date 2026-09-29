/**
 * File-type rules shared by uploads (what may be stored) and streaming (how it is served).
 * Anything a browser could execute (HTML, SVG, JS…) is never accepted and never served inline.
 */

export type UploadPurpose = 'material' | 'recording' | 'assignment' | 'banner' | 'document' | 'thumbnail';

const MB = 1024 * 1024;
const GB = 1024 * MB;

const MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
};

const VIDEO = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const DOCS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', 'zip', 'rar', '7z'];

/** Allowed extensions + maximum size for every upload purpose. */
export const UPLOAD_RULES: Record<UploadPurpose, { exts: string[]; maxBytes: number; label: string }> = {
  material:   { exts: [...VIDEO, 'pdf'], maxBytes: 4 * GB, label: 'video (mp4, mov, webm, mkv) or PDF' },
  recording:  { exts: VIDEO, maxBytes: 4 * GB, label: 'video (mp4, mov, webm, mkv)' },
  assignment: { exts: [...DOCS, ...IMAGE], maxBytes: 200 * MB, label: 'PDF, Office, image, text or zip file' },
  document:   { exts: [...DOCS, ...IMAGE], maxBytes: 200 * MB, label: 'PDF, Office, image, text or zip file' },
  banner:     { exts: IMAGE, maxBytes: 10 * MB, label: 'image (png, jpg, webp, gif)' },
  thumbnail:  { exts: IMAGE, maxBytes: 10 * MB, label: 'image (png, jpg, webp, gif)' },
};

/** Lower-case extension of a file name, or '' when it has none / looks unsafe. */
export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export function mimeFor(keyOrName: string): string {
  return MIME[extOf(keyOrName)] ?? 'application/octet-stream';
}

/** Media the browser may render inline (player / PDF viewer / <img>). Everything else downloads. */
export function isInlineSafe(keyOrName: string): boolean {
  const e = extOf(keyOrName);
  return [...VIDEO, 'mp3', 'm4a', 'wav', 'ogg', 'pdf', ...IMAGE].includes(e);
}

export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** True when a storage key was issued for this organisation (and, optionally, one of these purposes). */
export function keyBelongsTo(organizationId: string, key: string, purposes?: UploadPurpose[]): boolean {
  if (typeof key !== 'string' || key.includes('..')) return false;
  const parts = key.split('/');
  if (parts[0] !== 'org' || parts[1] !== organizationId) return false;
  return !purposes || purposes.includes(parts[2] as UploadPurpose);
}
