import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Always run at request time (never frozen into a static response at build time)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}

