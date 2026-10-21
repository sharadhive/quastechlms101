import { getActiveIntegration } from './store';

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ZoomMeetingResponse {
  id: number;
  join_url: string;
  start_url: string;
  password: string;
  topic: string;
}

// ─── Token cache (one token is valid for ~1 hour) ────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an OAuth access token using Zoom Server-to-Server OAuth.
 * Caches the token in memory until 2 minutes before expiry.
 */
async function getZoomToken(cfg: Record<string, any>): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const r = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${cfg.accountId}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
  );
  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    throw new Error(`Zoom OAuth failed: ${j?.reason ?? r.statusText}`);
  }
  const j: ZoomTokenResponse = await r.json();
  cachedToken = {
    token: j.access_token,
    expiresAt: Date.now() + (j.expires_in - 120) * 1000, // refresh 2 min early
  };
  return j.access_token;
}

/**
 * Create a Zoom meeting via the Zoom REST API.
 * Returns the join URL that students can click to enter the meeting.
 *
 * @param topic    - meeting title (e.g. "React Hooks — Batch A")
 * @param startTime - ISO 8601 datetime for when the meeting starts
 * @param durationMin - meeting length in minutes (default 60)
 * @param organizationId - used to look up the active Zoom integration
 *
 * @returns `{ joinUrl, startUrl, meetingId, password }` or `null` if Zoom is not configured
 */
export async function createZoomMeeting(opts: {
  topic: string;
  startTime: string;
  durationMin?: number;
  organizationId: string;
}): Promise<{ joinUrl: string; startUrl: string; meetingId: number; password: string } | null> {
  const cfg = await getActiveIntegration('ZOOM', opts.organizationId);
  if (!cfg) return null; // Zoom not configured — caller falls back to manual link

  const token = await getZoomToken(cfg);

  const body = {
    topic: opts.topic,
    type: 2, // scheduled meeting
    start_time: opts.startTime,
    duration: opts.durationMin ?? 60,
    timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
    settings: {
      join_before_host: true,
      waiting_room: false,
      mute_upon_entry: true,
      auto_recording: 'none',
      meeting_authentication: false,
    },
  };

  // "me" uses the account owner — works for Server-to-Server OAuth
  const r = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    console.error('[Zoom] Create meeting failed:', j);
    throw new Error(`Zoom meeting creation failed: ${j?.message ?? r.statusText}`);
  }

  const meeting: ZoomMeetingResponse = await r.json();
  return {
    joinUrl: meeting.join_url,
    startUrl: meeting.start_url,
    meetingId: meeting.id,
    password: meeting.password,
  };
}

/**
 * Check whether the Zoom integration is active for an organization.
 */
export async function isZoomActive(organizationId: string): Promise<boolean> {
  const cfg = await getActiveIntegration('ZOOM', organizationId);
  return !!cfg;
}
