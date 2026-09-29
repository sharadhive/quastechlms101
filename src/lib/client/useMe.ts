'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

export interface Me {
  user: { id: string; name: string; email: string; role: string; branchId: string | null };
  permissions: Record<
    'manage_content' | 'create_sessions' | 'announce' | 'view_contacts' | 'attendance_override' | 'publish_recordings',
    boolean
  >;
}

let cache: Promise<Me> | null = null;

/** Current user + effective permissions (cached for the page session). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!cache) cache = api<Me>('/api/auth/me').catch((e) => { cache = null; throw e; });
    cache.then(setMe).catch(() => {});
  }, []);
  return me;
}

export function clearMe() { cache = null; }
