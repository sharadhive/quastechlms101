import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/jobs/queue';

const AUTO_ISSUE_PCT = 100; // org-configurable later via branding JSON

/** Evaluated on every progress update — issues once, idempotently. */
export async function maybeIssueCertificate(enrollmentId: string, progressPct: number) {
  if (progressPct < AUTO_ISSUE_PCT) return;
  const existing = await prisma.certificate.findFirst({ where: { enrollmentId } });
  if (existing) return;
  await issueCertificate(enrollmentId);
}

export async function issueCertificate(enrollmentId: string) {
  const verifyCode = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 chars
  const cert = await prisma.certificate.create({
    data: { enrollmentId, verifyCode, pdfKey: '' }, // pdfKey filled by the render job
  });
  await enqueue('RENDER_CERTIFICATE_PDF', { certificateId: cert.id });
  return cert;
}
