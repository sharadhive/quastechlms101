import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import type { MailProvider } from './index';
import { getSmtpSettings } from '@/lib/integrations/store';

export class MailSendError extends Error {}

/** Real mailer. Credentials come from the Super Admin → Integrations panel, or .env as fallback. */
export const smtpMailer: MailProvider = {
  async send({ to, subject, body, meta }) {
    const s = await getSmtpSettings();
    const record = (extra: Record<string, unknown>) =>
      prisma.outbox
        .create({ data: { toEmail: to, subject, body, meta: { ...((meta as any) ?? {}), ...extra } as any } })
        .catch(() => {});

    if (!s.host || !s.user) {
      await record({ failed: true, error: 'No email provider configured' });
      throw new MailSendError('Email is not set up yet (Super Admin → Integrations → Email)');
    }
    try {
      const transporter = nodemailer.createTransport({
        host: s.host,
        port: s.port,
        secure: s.port === 465,
        auth: { user: s.user, pass: s.pass },
      });
      await transporter.sendMail({ from: s.from, to, subject, text: body });
    } catch (err: any) {
      // Keep a copy in the Outbox so nothing is lost, then report a clear reason
      await record({ failed: true, error: String(err?.message ?? err).slice(0, 300) });
      const auth = /535|Invalid login|BadCredentials|auth/i.test(String(err?.message));
      throw new MailSendError(
        auth
          ? 'Email login was refused by the mail server (for Gmail use a 16-character App Password) — check Super Admin → Integrations → Email'
          : `Email could not be sent: ${String(err?.message ?? err).slice(0, 120)}`,
      );
    }
    await record({});
  },
};
