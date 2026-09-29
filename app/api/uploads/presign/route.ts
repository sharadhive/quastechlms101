import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { withHandler, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';
import { UPLOAD_RULES, extOf, formatBytes } from '@/lib/utils/files';

const schema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  purpose: z.enum(['material', 'recording', 'assignment', 'banner', 'document', 'thumbnail']),
});

export const POST = withHandler(async (req: NextRequest) => {
  // Students may presign ONLY assignment uploads; staff can presign everything
  const body = await parseBody(req, schema);
  const session =
    body.purpose === 'assignment'
      ? await requireRole(req, ['STUDENT', ...ADMIN_ROLES, 'INSTRUCTOR'])
      : await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);

  // File-type + size whitelist per purpose (blocks .html/.svg/.js etc.)
  const rule = UPLOAD_RULES[body.purpose];
  const ext = extOf(body.fileName);
  if (!ext || !rule.exts.includes(ext))
    throw badRequest(`This file type is not allowed here. Please upload a ${rule.label}.`);
  if (body.sizeBytes > rule.maxBytes)
    throw badRequest(`File is too large (max ${formatBytes(rule.maxBytes)}).`);

  const key = `org/${session.organizationId}/${body.purpose}/${crypto.randomUUID()}.${ext}`;
  const upload = await getStorage().presignPut(key, body.contentType, body.sizeBytes);
  return NextResponse.json({ upload });
});
