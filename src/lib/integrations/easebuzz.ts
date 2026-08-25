import crypto from 'crypto';
import { getActiveIntegration } from './store';

/** Easebuzz API base URLs */
const BASE = { test: 'https://testpay.easebuzz.in', live: 'https://pay.easebuzz.in' };

interface EasebuzzConfig {
  merchantKey: string;
  salt: string;
  mode: 'test' | 'live';
  merchantSubAccountId?: string;
}

async function getConfig(organizationId?: string): Promise<EasebuzzConfig> {
  const cfg = await getActiveIntegration('EASEBUZZ', organizationId);
  if (!cfg?.merchantKey || !cfg?.salt) throw new Error('Easebuzz is not configured. Set it up in Admin → Integrations.');
  return {
    merchantKey: String(cfg.merchantKey),
    salt: String(cfg.salt),
    mode: (cfg.mode === 'live' ? 'live' : 'test') as 'test' | 'live',
    merchantSubAccountId: cfg.merchantSubAccountId ? String(cfg.merchantSubAccountId) : undefined,
  };
}

/** Easebuzz hash generation: SHA-512 of pipe-delimited fields */
function generateHash(fields: string[], salt: string): string {
  const str = fields.join('|') + '|' + salt;
  return crypto.createHash('sha512').update(str).digest('hex');
}

export interface InitiatePaymentInput {
  txnId: string;
  amount: number;
  productInfo: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  successUrl: string;
  failureUrl: string;
  udf1?: string; // custom fields
  udf2?: string;
}

export interface InitiatePaymentResult {
  paymentUrl: string;
  accessKey: string;
}

/** Step 1: Call Easebuzz initiate API to get the payment access key */
export async function initiatePayment(
  input: InitiatePaymentInput,
  organizationId?: string,
): Promise<InitiatePaymentResult> {
  const cfg = await getConfig(organizationId);
  const base = BASE[cfg.mode];

  // Hash: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
  const hashFields = [
    cfg.merchantKey, input.txnId, String(input.amount.toFixed(2)),
    input.productInfo, input.customerName, input.customerEmail,
    input.udf1 ?? '', input.udf2 ?? '', '', '', '', '', '', '', '',
  ];
  const hash = generateHash(hashFields, cfg.salt);

  const body = new URLSearchParams({
    key: cfg.merchantKey,
    txnid: input.txnId,
    amount: input.amount.toFixed(2),
    productinfo: input.productInfo,
    firstname: input.customerName,
    email: input.customerEmail,
    phone: input.customerPhone,
    surl: input.successUrl,
    furl: input.failureUrl,
    hash,
    udf1: input.udf1 ?? '',
    udf2: input.udf2 ?? '',
    ...(cfg.merchantSubAccountId ? { sub_merchant_id: cfg.merchantSubAccountId } : {}),
  });

  const res = await fetch(`${base}/payment/initiateLink`, { method: 'POST', body });
  const json: any = await res.json();

  if (json.status !== 1) {
    throw new Error(json.error_desc ?? json.data ?? 'Easebuzz payment initiation failed');
  }

  return {
    accessKey: json.data,
    paymentUrl: `${base}/pay/${json.data}`,
  };
}

/** Step 2: Verify the response hash from Easebuzz callback */
export function verifyResponseHash(params: Record<string, string>, salt: string): boolean {
  const receivedHash = params.hash;
  if (!receivedHash) return false;

  // Reverse hash: SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
  const hashFields = [
    salt, params.status ?? '',
    '', '', '', '', '',
    params.udf5 ?? '', params.udf4 ?? '', params.udf3 ?? '',
    params.udf2 ?? '', params.udf1 ?? '',
    params.email ?? '', params.firstname ?? '',
    params.productinfo ?? '', params.amount ?? '', params.txnid ?? '',
    params.key ?? '',
  ];
  const expected = crypto.createHash('sha512').update(hashFields.join('|')).digest('hex');
  return receivedHash === expected;
}

export async function verifyCallback(
  params: Record<string, string>,
  organizationId?: string,
): Promise<{ verified: boolean; status: string; txnId: string }> {
  const cfg = await getConfig(organizationId);
  const verified = verifyResponseHash(params, cfg.salt);
  return {
    verified,
    status: params.status ?? 'unknown',
    txnId: params.txnid ?? '',
  };
}

/** Step 3: Check transaction status via Easebuzz API */
export async function getTransactionStatus(txnId: string, organizationId?: string) {
  const cfg = await getConfig(organizationId);
  const base = BASE[cfg.mode];

  const hashFields = [cfg.merchantKey, txnId, cfg.salt];
  const hash = crypto.createHash('sha512').update(hashFields.join('|')).digest('hex');

  const body = new URLSearchParams({ key: cfg.merchantKey, txnid: txnId, hash });
  const res = await fetch(`${base}/transaction/v2.0/retrieve`, { method: 'POST', body });
  const json: any = await res.json();
  return json;
}
