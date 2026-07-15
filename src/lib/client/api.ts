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
  if (!res.ok) throw new Error((data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Presign → direct PUT to storage → complete. Returns the storage key (SRS 12.4). */
export async function uploadFile(
  file: File,
  purpose: 'material' | 'recording' | 'assignment' | 'banner' | 'document',
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { upload } = await api('/api/uploads/presign', {
    method: 'POST',
    json: { fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size, purpose },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
  await api('/api/uploads/complete', { method: 'POST', json: { key: upload.key } });
  return upload.key;
}

export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/admin', ADMIN: '/admin', BRANCH_ADMIN: '/admin',
  INSTRUCTOR: '/instructor', STUDENT: '/app',
};