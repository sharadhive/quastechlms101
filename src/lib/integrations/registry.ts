export interface Field {
  key: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'select' | 'textarea';
  secret?: boolean;          // stored encrypted, shown masked
  required?: boolean;
  placeholder?: string;
  help?: string;             // guided hint shown under the field
  options?: string[];
  default?: string | number;
}

export interface ProviderDef {
  provider: string;
  name: string;
  icon: string;
  category: 'Communication' | 'Payments' | 'Meetings' | 'Storage' | 'Notifications';
  summary: string;
  setupSteps: string[];      // shown to first-time users, in order
  docsUrl?: string;
  testable: boolean;
  fields: Field[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    provider: 'SMTP',
    name: 'Email (SMTP)',
    icon: '📧',
    category: 'Communication',
    summary: 'Sends OTP codes, welcome emails, fee reminders, results and campaigns.',
    setupSteps: [
      'Use any provider: Gmail, Brevo (300 free/day), SendGrid, or your hosting mail.',
      'For Gmail: enable 2-Step Verification, then create an App Password.',
      'Paste the details below and press “Test connection” — a test email is sent to you.',
      'Press “Activate” to make this the live mailer.',
    ],
    docsUrl: 'https://myaccount.google.com/apppasswords',
    testable: true,
    fields: [
      { key: 'host', label: 'SMTP host', type: 'text', required: true, placeholder: 'smtp.gmail.com', help: 'Gmail: smtp.gmail.com · Brevo: smtp-relay.brevo.com' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 587, placeholder: '587', help: '587 for TLS (recommended), 465 for SSL' },
      { key: 'user', label: 'Username', type: 'text', required: true, placeholder: 'you@gmail.com', help: 'Usually the full email address' },
      { key: 'pass', label: 'Password / App Password', type: 'password', secret: true, required: true, placeholder: '16-character app password', help: 'Never your normal Gmail password — use an App Password' },
      { key: 'from', label: 'Send emails from', type: 'text', required: true, placeholder: 'QUASTECH <you@gmail.com>', help: 'What students see as the sender' },
    ],
  },
  {
    provider: 'WHATSAPP',
    name: 'WhatsApp Business',
    icon: '💬',
    category: 'Communication',
    summary: 'Sends class reminders, fee reminders and announcements to WhatsApp.',
    setupSteps: [
      'Create a Meta Business account and add the WhatsApp product.',
      'Copy the Phone Number ID and the permanent Access Token.',
      'Approve your message templates inside Meta Business Manager.',
      'Test, then activate.',
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    testable: true,
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: '1093...4821', help: 'WhatsApp Manager → API Setup' },
      { key: 'businessAccountId', label: 'Business Account ID', type: 'text', placeholder: '8873...1290' },
      { key: 'accessToken', label: 'Permanent Access Token', type: 'password', secret: true, required: true, placeholder: 'EAAG...', help: 'Use a permanent token, not the 24-hour temporary one' },
      { key: 'templateName', label: 'Default template name', type: 'text', placeholder: 'class_reminder', help: 'An approved template used for reminders' },
    ],
  },
  {
    provider: 'RAZORPAY',
    name: 'Razorpay (online fees)',
    icon: '💳',
    category: 'Payments',
    summary: 'Lets students pay fees online; payments post back to their fee account.',
    setupSteps: [
      'Log in to the Razorpay Dashboard → Settings → API Keys → Generate key.',
      'Paste the Key ID and Key Secret below.',
      'Add the webhook URL shown after activation to Razorpay → Webhooks.',
    ],
    docsUrl: 'https://dashboard.razorpay.com/app/keys',
    testable: true,
    fields: [
      { key: 'keyId', label: 'Key ID', type: 'text', required: true, placeholder: 'rzp_live_XXXXXXXX' },
      { key: 'keySecret', label: 'Key Secret', type: 'password', secret: true, required: true, placeholder: 'Shown only once by Razorpay' },
      { key: 'webhookSecret', label: 'Webhook secret', type: 'password', secret: true, placeholder: 'Set the same value in Razorpay → Webhooks' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['test', 'live'], default: 'test', help: 'Start in test mode until everything works' },
    ],
  },
  {
    provider: 'EASEBUZZ',
    name: 'Easebuzz (online payments)',
    icon: '💳',
    category: 'Payments',
    summary: 'Lets students buy courses online via Easebuzz payment gateway (UPI, cards, net-banking, wallets).',
    setupSteps: [
      'Log in to the Easebuzz Dashboard → Settings → Get your Merchant Key and Salt.',
      'Paste the Key and Salt below.',
      'Set mode to "test" for sandbox testing, "live" for production.',
      'Test, then activate — the course marketplace uses the active Easebuzz configuration.',
    ],
    docsUrl: 'https://docs.easebuzz.in/',
    testable: true,
    fields: [
      { key: 'merchantKey', label: 'Merchant Key', type: 'text', required: true, placeholder: 'Your Easebuzz merchant key' },
      { key: 'salt', label: 'Salt', type: 'password', secret: true, required: true, placeholder: 'Your Easebuzz salt (keep secret)' },
      { key: 'merchantSubAccountId', label: 'Sub-Account ID (optional)', type: 'text', placeholder: 'For sub-merchants only' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['test', 'live'], default: 'test', help: 'Start in test mode until everything works' },
    ],
  },
  {
    provider: 'ZOOM',
    name: 'Zoom (auto meetings)',
    icon: '🎥',
    category: 'Meetings',
    summary: 'Creates the meeting link automatically when a class is scheduled.',
    setupSteps: [
      'Zoom App Marketplace → Develop → Build App → Server-to-Server OAuth.',
      'Copy Account ID, Client ID and Client Secret.',
      'Grant the meeting:write scope and activate the app in Zoom.',
    ],
    docsUrl: 'https://marketplace.zoom.us',
    testable: true,
    fields: [
      { key: 'accountId', label: 'Account ID', type: 'text', required: true, placeholder: 'abc123XYZ' },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', secret: true, required: true },
    ],
  },
  {
    provider: 'STORAGE_S3',
    name: 'Cloud storage (S3 / Cloudflare R2)',
    icon: '☁️',
    category: 'Storage',
    summary: 'Moves course videos off the server to cloud storage — needed once video libraries grow.',
    setupSteps: [
      'Create a bucket in Cloudflare R2 (or AWS S3).',
      'Create an API token with read/write access to that bucket.',
      'Paste the endpoint, bucket name and keys below.',
    ],
    testable: true,
    fields: [
      { key: 'endpoint', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://<account>.r2.cloudflarestorage.com' },
      { key: 'bucket', label: 'Bucket name', type: 'text', required: true, placeholder: 'quastech-media' },
      { key: 'region', label: 'Region', type: 'text', default: 'auto', placeholder: 'auto' },
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', secret: true, required: true },
    ],
  },
  {
    provider: 'FIREBASE',
    name: 'Firebase (push notifications)',
    icon: '🔔',
    category: 'Notifications',
    summary: 'Sends push notifications to the mobile app / browser.',
    setupSteps: [
      'Firebase Console → Project settings → Service accounts.',
      'Click “Generate new private key” — a JSON file downloads.',
      'Paste the whole JSON content into the field below.',
    ],
    docsUrl: 'https://console.firebase.google.com',
    testable: false,
    fields: [
      { key: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: 'quastech-lms' },
      { key: 'serviceAccountJson', label: 'Service account JSON', type: 'textarea', secret: true, required: true, placeholder: '{ "type": "service_account", … }', help: 'Paste the entire downloaded file' },
    ],
  },
  {
    provider: 'SMS',
    name: 'SMS gateway',
    icon: '📱',
    category: 'Communication',
    summary: 'Sends OTP and reminders by SMS (MSG91, Twilio, TextLocal…).',
    setupSteps: [
      'Buy an SMS package and get your API key / auth token.',
      'Register your sender ID with the provider (DLT in India).',
    ],
    testable: true,
    fields: [
      { key: 'vendor', label: 'Provider', type: 'select', options: ['MSG91', 'Twilio', 'TextLocal', 'Other'], default: 'MSG91' },
      { key: 'senderId', label: 'Sender ID', type: 'text', required: true, placeholder: 'QSTECH', help: 'The 6-character DLT-approved sender name' },
      { key: 'apiKey', label: 'API key / Auth token', type: 'password', secret: true, required: true },
      { key: 'endpoint', label: 'API endpoint (if custom)', type: 'text', placeholder: 'https://api.msg91.com/api/v5/flow/' },
    ],
  },
];

export const getProvider = (p: string) => PROVIDERS.find((x) => x.provider === p);
export const secretKeys = (p: string) => (getProvider(p)?.fields ?? []).filter((f) => f.secret).map((f) => f.key);
