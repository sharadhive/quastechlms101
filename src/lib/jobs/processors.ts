import { prisma } from '@/lib/prisma';
import { getMailer } from '@/lib/adapters/mail';
import { getStorage } from '@/lib/adapters/storage';
import type { JobType } from './queue';

export async function runJob(type: JobType, payload: Record<string, unknown>): Promise<void> {
  const mailer = getMailer();
  switch (type) {
    case 'EMAIL_WELCOME': {
      const { to, name, email, tempPassword, courseTitle } = payload as any;
      await mailer.send({
        to,
        subject: 'Welcome — your course access is ready',
        body: [
          `Hi ${name},`,
          courseTitle ? `You have been enrolled in: ${courseTitle}.` : 'Your account has been created.',
          `Login email: ${email}`,
          `Temporary password: ${tempPassword}`,
          'You will be asked to set a new password on first login.',
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
        body: `Hi ${name},\nA payment of ₹${pendingAmount} is due${dueDate ? ` by ${dueDate}` : ''}. Please contact your branch office.`,
        meta: { type },
      });
      return;
    }

    case 'EMAIL_SESSION_REMINDER': {
      // T-24h / T-1h reminder to every ACTIVE learner in the batch (SRS 12.9)
      const { sessionId, offsetH } = payload as any;
      const cls = await prisma.classSession.findUnique({
        where: { id: sessionId },
        include: {
          batch: {
            include: {
              course: { select: { title: true } },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: { learner: { select: { name: true, email: true } } },
              },
            },
          },
        },
      });
      if (!cls) return; // session deleted — nothing to do
      for (const e of cls.batch.enrollments) {
        await mailer.send({
          to: e.learner.email,
          subject: `Reminder: "${cls.title}" ${offsetH === 1 ? 'starts in 1 hour' : 'is tomorrow'}`,
          body: `Hi ${e.learner.name},\n${cls.batch.course.title} — ${cls.title}\nScheduled: ${cls.scheduledAt.toLocaleString()}\n${cls.meetLink ? `Join: ${cls.meetLink}` : ''}`,
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
      if (!cert) return;
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
        .text(`Issued: ${cert.issuedAt.toDateString()}`, { align: 'center' })
        .text(`Verify: ${process.env.APP_URL}/api/verify/${cert.verifyCode}`, { align: 'center' })
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
        await mailer.send({
          to: learnerRow.learner.email,
          subject: 'Your certificate is ready',
          body: `Hi ${learnerRow.learner.name},\nCongratulations on completing "${enrollment.course.title}"! Download your certificate from the student panel.\nVerification code: ${cert.verifyCode}`,
          meta: { type },
        });
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
        .text(`Date: ${payment.receivedAt.toLocaleString()}`)
        .text(`Learner: ${e.learner.name}`)
        .text(`Course: ${e.course.title}`)
        .text(`Amount: ₹${payment.amount}`)
        .text(`Mode: ${payment.mode}${payment.referenceNo ? ` (Ref: ${payment.referenceNo})` : ''}`)
        .text(`Pending after payment: ₹${payment.feeAccount.pendingAmount}`);
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
