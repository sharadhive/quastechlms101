import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import type { MailProvider } from './index';
import { getSmtpSettings } from '@/lib/integrations/store';

/** Real mailer. Credentials come from the Super Admin → Integrations panel, or .env as fallback. */
export const smtpMailer: MailProvider = {
  async send({ to, subject, body, meta }) {
    const s = await getSmtpSettings();
    if (!s.host || !s.user) throw new Error('No email provider configured (Super Admin → Integrations)');

    const transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465,
      auth: { user: s.user, pass: s.pass },
    });
    await transporter.sendMail({ from: s.from, to, subject, text: body });
    await prisma.outbox
      .create({ data: { toEmail: to, subject, body, meta: meta ?? undefined } })
      .catch(() => {});
  },
};
