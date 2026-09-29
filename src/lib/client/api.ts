'use client';

/**
 * Single-flight refresh: when a page fires several requests at once and they all get a
 * 401, only ONE /api/auth/refresh runs — the others wait for it, then retry.
 * Without this, parallel refreshes look like token replay and log the user out.
 */
let refreshing: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 50);
      });
  }
  return refreshing;
}

/** JSON fetch with automatic silent refresh on 401 (SRS 12.1). */
export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const opts: RequestInit = {
    ...init,
    headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: 'same-origin',
  };
  let res = await fetch(path, opts);

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const ok = await refreshOnce();
    if (ok) {
      res = await fetch(path, opts); // retry with the fresh cookie
    } else {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && (data as any).code === 'MUST_CHANGE_PASSWORD') {
    window.location.href = '/change-password';
    throw new Error('Please set a new password first');
  }
  if (!res.ok) throw new Error((data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

type Purpose = 'material' | 'recording' | 'assignment' | 'banner' | 'document' | 'thumbnail';

class UploadError extends Error {
  constructor(message: string, public status: number, public data: any) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One PUT with upload progress. Resolves with the JSON body (if any). */
function put(url: string, blob: Blob, contentRange: string | null, onLoaded: (n: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentRange) xhr.setRequestHeader('Content-Range', contentRange);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* S3 returns XML/empty */ }
      if (xhr.status < 300) resolve(data);
      else reject(new UploadError(data.error ?? `Upload failed (${xhr.status})`, xhr.status, data));
    };
    xhr.onerror = () => reject(new UploadError('Network error during upload', 0, {}));
    xhr.send(blob);
  });
}

/**
 * Presign → upload → complete. Returns the storage key (SRS 12.4).
 * Big files go up in resumable chunks: a dropped connection retries and continues
 * from the last received byte instead of starting again.
 */
export async function uploadFile(
  file: File,
  purpose: Purpose,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { upload } = await api('/api/uploads/presign', {
    method: 'POST',
    json: { fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size, purpose },
  });
  const report = (sent: number) => onProgress?.(Math.min(100, Math.round((sent / Math.max(file.size, 1)) * 100)));

  const chunk: number | undefined = upload.chunkSize;
  if (!chunk || file.size <= chunk) {
    await put(upload.url, file, null, report);
  } else {
    let offset = 0;
    try {
      const st = await fetch(upload.url, { credentials: 'same-origin' }).then((r) => r.json());
      offset = st.done ? file.size : Number(st.received ?? 0);
    } catch { offset = 0; }

    let failures = 0;
    while (offset < file.size) {
      const end = Math.min(offset + chunk, file.size) - 1;
      try {
        const r = await put(upload.url, file.slice(offset, end + 1), `bytes ${offset}-${end}/${file.size}`,
          (n) => report(offset + n));
        offset = r.done ? file.size : Number(r.received ?? end + 1);
        failures = 0;
        report(offset);
      } catch (e: any) {
        // 409 = server has a different offset → jump to it; other 4xx are permanent
        if (e instanceof UploadError && e.status === 409 && typeof e.data?.received === 'number') {
          offset = e.data.received; continue;
        }
        if (e instanceof UploadError && [401, 403, 404, 413].includes(e.status)) throw e; // permanent
        if (++failures > 6) throw new Error('Upload keeps failing — check your internet connection and try again.');
        await sleep(Math.min(15000, 1000 * 2 ** failures));
        try {
          const st = await fetch(upload.url, { credentials: 'same-origin' }).then((r) => r.json());
          offset = st.done ? file.size : Number(st.received ?? offset);
        } catch { /* keep offset, retry */ }
      }
    }
  }
  await api('/api/uploads/complete', { method: 'POST', json: { key: upload.key } });
  onProgress?.(100);
  return upload.key;
}

export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/admin', ADMIN: '/admin', BRANCH_ADMIN: '/admin',
  INSTRUCTOR: '/instructor', STUDENT: '/app',
};

/** Accept attribute for <input type="file"> per upload purpose (mirrors server rules). */
export const ACCEPT: Record<Purpose | 'video' | 'pdf', string> = {
  video: 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv,.m4v',
  pdf: 'application/pdf,.pdf',
  material: 'video/*,application/pdf,.mp4,.mov,.webm,.mkv,.m4v,.pdf',
  recording: 'video/*,.mp4,.mov,.webm,.mkv,.m4v',
  assignment: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.gif',
  document: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.gif',
  banner: 'image/png,image/jpeg,image/webp,image/gif',
  thumbnail: 'image/png,image/jpeg,image/webp,image/gif',
};
