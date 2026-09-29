import { prisma } from '@/lib/prisma';
import type { MailProvider } from './index';

/**
 * Development mailer: logs to console AND persists to the `Outbox` table
 * so testers can see every email the system "sent" from the admin panel.
 */
export const consoleMailer: MailProvider = {
  async send({ to, subject, body, meta }) {
    console.log(`\n[MAIL → ${to}] ${subject}\n${body}\n`);
    await prisma.outbox.create({ data: { toEmail: to, subject, body, meta: (meta as any) ?? undefined } });
  },
};
