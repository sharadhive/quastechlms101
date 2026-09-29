import { prisma } from '@/lib/prisma';
import { getMailer } from '@/lib/adapters/mail';
import { getStorage } from '@/lib/adapters/storage';
import type { JobType } from './queue';
import { decryptJson } from '@/lib/crypto';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:3000';
const TZ = () => process.env.APP_TIMEZONE ?? 'Asia/Kolkata';
/** Dates in emails/PDFs are shown in the institute's timezone, not the server's (usually UTC). */
const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: TZ(), dateStyle: 'medium', timeStyle: 'short' });
/** pdfkit's built-in fonts have no ₹ glyph */
const money = (v: unknown) => `Rs. ${Number(v ?? 0).toLocaleString('en-IN')}`;

export async function runJob(type: JobType, payload: Record<string, unknown>): Promise<void> {
  const mailer = getMailer();
  switch (type) {
    case 'EMAIL_WELCOME': {
      // Account created / password reset — contains the temporary password
      const { to, name, email, tempPasswordEnc, tempPassword: legacyPlain, courseTitle, reset } = payload as any;
      const tempPassword = tempPasswordEnc ? decryptJson<{ p: string }>(tempPasswordEnc).p : legacyPlain;
      await mailer.send({
        to,
        subject: reset ? 'Your password has been reset' : 'Welcome — your account is ready',
        body: [
          `Hi ${name},`,
          reset
            ? 'An administrator has reset your password.'
            : courseTitle ? `You have been enrolled in: ${courseTitle}.` : 'Your account has been created.',
          `Login page: ${APP_URL()}/login`,
          `Login email: ${email}`,
          `Temporary password: ${tempPassword}`,
          'You will be asked to set your own password when you first sign in.',
          `Forgot it? Use "Forgot password" on the login page: ${APP_URL()}/forgot-password`,
        ].join('\n'),
        meta: { type },
      });
      return;
    }

    case 'EMAIL_ENROLLED': {
      // Enrolment confirmation for an existing account — no password inside
      const { to, name, courseTitle, batchName } = payload as any;
      await mailer.send({
        to,
        subject: `You are enrolled: ${courseTitle}`,
        body: [
          `Hi ${name},`,
          `You have been enrolled in "${courseTitle}"${batchName ? ` (batch: ${batchName})` : ''}.`,
          `Open it from "My Courses" after signing in: ${APP_URL()}/login`,
          `Use the password you already have, or "Forgot password" to set a new one: ${APP_URL()}/forgot-password`,
        ].join('\n'),
        meta: { type },
      });
      return;
    }

    case 'EMAIL_FEE_REMINDER': {
      const { to, name, pendingAmount, dueDate } = payload as any;
      await mailer.send({
        to,
        subject: 'Fee reminder',
        body: `Hi ${name},\nA payment of ₹${Number(pendingAmount).toLocaleString('en-IN')} is due${dueDate ? ` by ${new Date(dueDate).toLocaleDateString('en-IN', { timeZone: TZ(), dateStyle: 'medium' })}` : ''}. Please contact your branch office.`,
        meta: { type },
      });
      return;
    }

    case 'EMAIL_SESSION_REMINDER': {
      // T-24h / T-1h reminder to every ACTIVE learner in the batch (SRS 12.9)
      const { sessionId, offsetH, scheduledAt } = payload as any;
      const cls = await prisma.classSession.findUnique({
        where: { id: sessionId },
        include: {
          batch: {
            include: {
              course: { select: { title: true } },
              enrollments: {
                where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
                include: { learner: { select: { name: true, email: true } } },
              },
            },
          },
        },
      });
      if (!cls) return; // session cancelled — nothing to do
      // Rescheduled after this reminder was queued → a fresh reminder exists for the new time
      if (scheduledAt && new Date(scheduledAt).getTime() !== cls.scheduledAt.getTime()) return;
      for (const e of cls.batch.enrollments) {
        await mailer.send({
          to: e.learner.email,
          subject: `Reminder: "${cls.title}" ${offsetH === 1 ? 'starts in 1 hour' : 'is tomorrow'}`,
          body: `Hi ${e.learner.name},\n${cls.batch.course.title} — ${cls.title}\nScheduled: ${fmtDateTime(cls.scheduledAt)}\n${cls.meetLink ? `Join: ${cls.meetLink}` : ''}`,
          meta: { type, sessionId },
        });
      }
      return;
    }

    case 'EMAIL_RESULT_PUBLISHED': {
      const { learnerId, materialTitle } = payload as any;
      const learner = await prisma.user.findUnique({ where: { id: learnerId } });
      if (!learner) return;
      await mailer.send({
        to: learner.email,
        subject: 'Your result has been published',
        body: `Hi ${learner.name},\nYour result for "${materialTitle}" is now available in your student panel.`,
        meta: { type },
      });
      return;
    }

    case 'CAMPAIGN_SEND': {
      const { campaignId, to, name, subject, body } = payload as any;
      await mailer.send({
        to,
        subject,
        body: body.replaceAll('{{name}}', name ?? ''),
        meta: { type, campaignId },
      });
      // mark campaign SENT when its last job drains
      const remaining = await prisma.jobQueue.count({
        where: { type: 'CAMPAIGN_SEND', status: { in: ['PENDING', 'RUNNING'] }, payload: { path: '$.campaignId', equals: campaignId } },
      });
      if (remaining <= 1)
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENT' } });
      return;
    }

    case 'RENDER_CERTIFICATE_PDF': {
      // pdfkit is a local library, not a third-party API — allowed under Ch. 9 policy
      const { certificateId } = payload as any;
      const cert = await prisma.certificate.findUnique({ where: { id: certificateId } });
      if (!cert || cert.pdfKey) return; // already rendered
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: cert.enrollmentId },
        include: {
          learner: { select: { name: true } },
          course: { select: { title: true, organizationId: true } },
        },
      });
      if (!enrollment) return;
      const org = await prisma.organization.findUnique({
        where: { id: enrollment.course.organizationId },
      });

      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

      doc.fontSize(14).text(org?.name ?? '', { align: 'center' });
      doc.moveDown(2).fontSize(30).text('Certificate of Completion', { align: 'center' });
      doc.moveDown(1.5).fontSize(14).text('This certifies that', { align: 'center' });
      doc.moveDown(0.5).fontSize(24).text(enrollment.learner.name, { align: 'center', underline: true });
      doc.moveDown(0.5).fontSize(14).text('has successfully completed', { align: 'center' });
      doc.moveDown(0.5).fontSize(18).text(enrollment.course.title, { align: 'center' });
      doc.moveDown(2).fontSize(10)
        .text(`Issued: ${cert.issuedAt.toLocaleDateString('en-IN', { timeZone: TZ(), dateStyle: 'long' })}`, { align: 'center' })
        .text(`Verify: ${process.env.APP_URL ?? ""}/verify/${cert.verifyCode}`, { align: 'center' })
        .text(`Code: ${cert.verifyCode}`, { align: 'center' });
      doc.end();

      const pdf = await done;
      const key = `org/${enrollment.course.organizationId}/certificates/${cert.id}.pdf`;
      await getStorage().put(key, pdf, 'application/pdf');
      await prisma.certificate.update({ where: { id: cert.id }, data: { pdfKey: key } });

      // notify + email the learner
      const learnerRow = await prisma.enrollment.findUnique({
        where: { id: cert.enrollmentId },
        select: { learnerId: true, learner: { select: { email: true, name: true } } },
      });
      if (learnerRow) {
        await prisma.notification.create({
          data: {
            userId: learnerRow.learnerId,
            type: 'CERTIFICATE_ISSUED',
            title: 'Certificate issued',
            body: `Your certificate for "${enrollment.course.title}" is ready.`,
            link: '/app/certificates',
          },
        });
        // email is a bonus — a mail problem must not re-run the PDF job (duplicate notifications)
        try {
          await mailer.send({
            to: learnerRow.learner.email,
            subject: 'Your certificate is ready',
            body: `Hi ${learnerRow.learner.name},\nCongratulations on completing "${enrollment.course.title}"! Download your certificate from the student panel.\nVerification code: ${cert.verifyCode}`,
            meta: { type },
          });
        } catch (e: any) { console.error('[job certificate] email failed:', e?.message ?? e); }
      }
      return;
    }

    case 'RENDER_RECEIPT_PDF': {
      const { paymentId } = payload as any;
      const payment = await prisma.feePayment.findUnique({
        where: { id: paymentId },
        include: {
          feeAccount: {
            include: {
              enrollment: {
                include: {
                  learner: { select: { name: true } },
                  course: { select: { title: true, organizationId: true } },
                },
              },
            },
          },
        },
      });
      if (!payment) return;
      const e = payment.feeAccount.enrollment;

      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A5', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

      doc.fontSize(18).text('Payment Receipt', { align: 'center' }).moveDown();
      doc.fontSize(11)
        .text(`Receipt No: ${payment.receiptNo}`)
        .text(`Date: ${fmtDateTime(payment.receivedAt)}`)
        .text(`Learner: ${e.learner.name}`)
        .text(`Course: ${e.course.title}`)
        .text(`Amount: ${money(payment.amount)}`)
        .text(`Mode: ${payment.mode}${payment.referenceNo ? ` (Ref: ${payment.referenceNo})` : ''}`)
        .text(`Balance pending: ${money(payment.feeAccount.pendingAmount)}`);
      doc.end();

      const pdf = await done;
      const key = `org/${e.course.organizationId}/receipts/${payment.id}.pdf`;
      await getStorage().put(key, pdf, 'application/pdf');
      return;
    }

    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}
