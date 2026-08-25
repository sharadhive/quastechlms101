import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';

/**
 * SmartAccess base URL — set in .env as SMARTACCESS_API_URL
 * e.g. https://smartaccess.in/api/lms
 */
const SA_BASE = process.env.SMARTACCESS_API_URL ?? 'https://smartaccess.in/api/lms';

// ── In-memory cache (avoids hammering SmartAccess on every page load) ──
let cache: { locations: string[]; colleges: string[]; educations: string[]; ts: number } | null = null;
const TTL = 5 * 60 * 1000; // 5 minutes

/** Safe JSON fetch with timeout — returns null on any failure */
async function safeFetch<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Merge two string arrays → sorted, unique, trimmed */
function merge(...arrays: string[][]): string[] {
  const set = new Set<string>();
  for (const arr of arrays) {
    for (const v of arr) {
      const t = v?.trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

// ── SmartAccess response types ──
interface SALocations { success: boolean; data: { cities: string[]; states: string[]; all: string[] } }
interface SAColleges { success: boolean; data: Array<{ id: number; name: string }> }
interface SAEducation { success: boolean; data: { streams: string[]; educationTypes: string[] } }

// Static fallback education list (used when SmartAccess is unreachable)
const FALLBACK_EDUCATIONS = [
  'B.Tech', 'B.E.', 'BCA', 'BCS', 'B.Sc IT', 'B.Sc CS',
  'MCA', 'M.Tech', 'M.Sc IT', 'M.Sc CS', 'MBA',
  'Diploma', 'BBA', 'B.Com', 'BA', 'MA',
  'Ph.D', '12th Pass', '10th Pass', 'Other',
];

/**
 * GET /api/lookups — public, no auth needed (registration form)
 *
 * 1. Fetches live data from SmartAccess /lms/locations, /lms/colleges, /lms/education
 * 2. Merges with any locally-added entries in the QUASTECH OS DB
 * 3. Returns { locations, colleges, educations } as sorted string arrays
 * 4. Results are cached for 5 minutes so SmartAccess isn't hit on every keystroke
 */
export async function GET() {
  // Return cache if still fresh
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({
      locations: cache.locations,
      colleges: cache.colleges,
      educations: cache.educations,
    });
  }

  // ── Fetch from SmartAccess + local DB in parallel ──
  const [saLocations, saColleges, saEducation, localLocations, localColleges] = await Promise.all([
    safeFetch<SALocations>(`${SA_BASE}/locations`),
    safeFetch<SAColleges>(`${SA_BASE}/colleges?limit=200`),
    safeFetch<SAEducation>(`${SA_BASE}/education`),
    prisma.location.findMany({
      where: { organizationId: ORG_ID },
      orderBy: { name: 'asc' },
      select: { name: true },
    }),
    prisma.college.findMany({
      where: { organizationId: ORG_ID },
      orderBy: { name: 'asc' },
      select: { name: true },
    }),
  ]);

  // ── Merge SmartAccess + local data ──
  const locations = merge(
    saLocations?.data?.cities ?? [],
    saLocations?.data?.states ?? [],
    localLocations.map((l) => l.name),
  );

  const colleges = merge(
    (saColleges?.data ?? []).map((c) => c.name),
    localColleges.map((c) => c.name),
  );

  const educations = merge(
    saEducation?.data?.streams ?? [],
    FALLBACK_EDUCATIONS,
  );

  // Update cache
  cache = { locations, colleges, educations, ts: Date.now() };

  return NextResponse.json({ locations, colleges, educations });
}
