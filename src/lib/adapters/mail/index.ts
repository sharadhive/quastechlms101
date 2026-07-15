export interface MailMessage {
  to: string;
  subject: string;
  body: string; // plain text / simple HTML
  meta?: Record<string, unknown>;
}

export interface MailProvider {
  send(msg: MailMessage): Promise<void>;
}

import { consoleMailer } from './console';
import { smtpMailer } from './smtp';

/** MAIL_DRIVER=console (dev, Outbox only) | smtp (real email — Gmail/Brevo/etc.) */
export function getMailer(): MailProvider {
  const driver = process.env.MAIL_DRIVER ?? 'console';
  switch (driver) {
    case 'console':
      return consoleMailer;
    case 'smtp':
      return smtpMailer;
    default:
      throw new Error(`MAIL_DRIVER "${driver}" not implemented`);
  }
}
