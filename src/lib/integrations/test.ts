import nodemailer from 'nodemailer';

export interface TestResult { ok: boolean; message: string; }

/** Each provider gets a real connectivity check where one is possible. */
export async function testIntegration(
  provider: string,
  cfg: Record<string, any>,
  testEmailTo?: string,
): Promise<TestResult> {
  try {
    switch (provider) {
      case 'SMTP': {
        const t = nodemailer.createTransport({
          host: cfg.host, port: Number(cfg.port ?? 587),
          secure: Number(cfg.port) === 465,
          auth: { user: cfg.user, pass: cfg.pass },
        });
        await t.verify();
        if (testEmailTo) {
          await t.sendMail({
            from: cfg.from ?? cfg.user, to: testEmailTo,
            subject: 'QUASTECH OS — test email ✅',
            text: 'Your email integration is working. This message was sent from the Integrations panel.',
          });
          return { ok: true, message: `Connected. A test email was sent to ${testEmailTo}.` };
        }
        return { ok: true, message: 'SMTP connection successful.' };
      }
      case 'WHATSAPP': {
        const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`, {
          headers: { Authorization: `Bearer ${cfg.accessToken}` },
        });
        const j: any = await r.json();
        if (!r.ok) return { ok: false, message: j?.error?.message ?? 'WhatsApp rejected the credentials' };
        return { ok: true, message: `Connected to ${j.verified_name ?? 'WhatsApp'} (${j.display_phone_number ?? ''}).` };
      }
      case 'RAZORPAY': {
        const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64');
        const r = await fetch('https://api.razorpay.com/v1/payments?count=1', { headers: { Authorization: `Basic ${auth}` } });
        if (r.status === 401) return { ok: false, message: 'Razorpay rejected the key / secret.' };
        if (!r.ok) return { ok: false, message: `Razorpay returned ${r.status}.` };
        return { ok: true, message: `Razorpay keys valid (${cfg.mode ?? 'test'} mode).` };
      }
      case 'EASEBUZZ': {
        // Validate by calling the Easebuzz initiate API with a minimal test payload
        const base = cfg.mode === 'live' ? 'https://pay.easebuzz.in' : 'https://testpay.easebuzz.in';
        const crypto = await import('crypto');
        const txnid = `TEST_${Date.now()}`;
        const amount = '1.00';
        const hashStr = `${cfg.merchantKey}|${txnid}|${amount}|test|test@test.com|test|||||||||||${cfg.salt}`;
        const hash = crypto.createHash('sha512').update(hashStr).digest('hex');
        const body = new URLSearchParams({
          key: cfg.merchantKey, txnid, amount, productinfo: 'test',
          firstname: 'test', email: 'test@test.com', phone: '9999999999',
          surl: 'https://localhost/success', furl: 'https://localhost/failure', hash,
        });
        const r = await fetch(`${base}/payment/initiateLink`, { method: 'POST', body });
        const j: any = await r.json();
        if (j.status === 1) return { ok: true, message: `Easebuzz connected (${cfg.mode ?? 'test'} mode). Key is valid.` };
        return { ok: false, message: j.error_desc ?? j.data ?? 'Easebuzz rejected the credentials.' };
      }
      case 'ZOOM': {
        const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
        const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${cfg.accountId}`, {
          method: 'POST', headers: { Authorization: `Basic ${basic}` },
        });
        const j: any = await r.json();
        if (!r.ok) return { ok: false, message: j?.reason ?? 'Zoom rejected the credentials' };
        return { ok: true, message: 'Zoom credentials valid — meetings can be created automatically.' };
      }
      case 'STORAGE_S3': {
        const r = await fetch(String(cfg.endpoint), { method: 'HEAD' }).catch(() => null);
        if (!r) return { ok: false, message: 'Endpoint unreachable from the server.' };
        return { ok: true, message: 'Endpoint reachable. Keys are verified on the first upload.' };
      }
      case 'SMS':
        return { ok: true, message: 'Saved. SMS delivery is verified with the first message sent.' };
      default:
        return { ok: true, message: 'Saved. No automatic test available for this provider.' };
    }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Connection failed' };
  }
}
