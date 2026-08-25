import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(3),
  sizeBytes: z.number().positive().max(4 * 1024 * 1024 * 1024), // 4GB cap
  purpose: z.enum(['material', 'recording', 'assignment', 'banner', 'document', 'thumbnail']),
});

export const POST = withHandler(async (req: NextRequest) => {
  // Students may presign ONLY assignment uploads; staff can presign everything
  const body = await parseBody(req, schema);
  const session =
    body.purpose === 'assignment'
      ? await requireRole(req, ['STUDENT', ...ADMIN_ROLES, 'INSTRUCTOR'])
      : await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);

  const ext = body.fileName.includes('.') ? body.fileName.split('.').pop() : 'bin';
  const key = `org/${session.organizationId}/${body.purpose}/${crypto.randomUUID()}.${ext}`;
  const upload = await getStorage().presignPut(key, body.contentType, body.sizeBytes);
  return NextResponse.json({ upload });
});

