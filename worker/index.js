/*
 * ASTO SECURITY — Cloudflare Worker for the website enquiry form.
 *
 * Routes (all other requests are served from ./public by the static-assets binding):
 *   GET  /api/enquiry/config  → { enabled, turnstileSiteKey }  (tells the page whether the form is live)
 *   POST /api/enquiry         → validates, verifies Turnstile, forwards to Google Apps Script, which emails
 *                               admin@astosec.com (recipient is fixed inside Apps Script, not here).
 *
 * Configuration (Cloudflare secrets; never committed to the repository):
 *   FORM_ENABLED              "true" to accept enquiries. Leave unset in production until launch is approved.
 *   TURNSTILE_SITE_KEY        public Turnstile site key (sent to the browser)
 *   TURNSTILE_SECRET_KEY      private Turnstile secret key
 *   APPS_SCRIPT_URL           the Apps Script web app URL (https://script.google.com/macros/s/…/exec)
 *   APPS_SCRIPT_SHARED_SECRET random string (32+ characters) also stored in the Apps Script's properties
 *
 * Privacy: this Worker never logs names, emails, phone numbers or messages; only short error codes.
 */

export const SERVICES = ['CCTV installation', 'Intruder alarms', 'Preventative maintenance', 'General enquiry'];
export const PROPERTY_TYPES = ['Residential', 'Small business'];
export const LIMITS = { name: 100, email: 160, phone: 20, suburb: 60, message: 2000 };
const MAX_BODY_BYTES = 10_000;
const MIN_FILL_MS = 3000;
const TURNSTILE_ACTION = 'enquiry';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
const PHONE = /^[0-9+()\s-]{8,20}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

export function isConfigured(env) {
  return env.FORM_ENABLED === 'true'
    && Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
    && APPS_SCRIPT_URL.test(env.APPS_SCRIPT_URL || '')
    && String(env.APPS_SCRIPT_SHARED_SECRET || '').length >= 32;
}

// Remove control characters (incl. CR/LF, which could otherwise inject email headers) and trim.
const clean = (value, keepNewlines = false) => String(value ?? '')
  .replace(keepNewlines ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, keepNewlines ? '' : ' ')
  .replace(/\r\n?/g, '\n')
  .trim();

/** Validate an enquiry. Returns { enquiry } or { errors: { field: message } }. */
export function validateEnquiry(input) {
  const src = input && typeof input === 'object' ? input : {};
  const e = {
    service: clean(src.service),
    name: clean(src.name),
    email: clean(src.email).toLowerCase(),
    phone: clean(src.phone),
    suburb: clean(src.suburb),
    property_type: clean(src.property_type),
    message: clean(src.message, true),
  };
  const errors = {};
  if (!SERVICES.includes(e.service)) errors.service = 'Please choose the service you need.';
  if (!PROPERTY_TYPES.includes(e.property_type)) errors.property_type = 'Please choose a property type.';
  if (!e.name || e.name.length > LIMITS.name) errors.name = 'Please enter your name.';
  if (!EMAIL.test(e.email) || e.email.length > LIMITS.email) errors.email = 'Please enter a valid email address.';
  if (e.phone && (!PHONE.test(e.phone) || e.phone.length > LIMITS.phone)) errors.phone = 'Please enter a valid phone number, or leave it blank.';
  if (!e.suburb || e.suburb.length > LIMITS.suburb) errors.suburb = 'Please enter your suburb.';
  if (e.message.length < 10 || e.message.length > LIMITS.message) errors.message = 'Please tell us a little about the job (10 to 2,000 characters).';
  return Object.keys(errors).length ? { errors } : { enquiry: e };
}

async function verifyTurnstile(token, request, env) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    const outcome = await res.json();
    return outcome.success === true
      && outcome.hostname === new URL(request.url).hostname
      && (!outcome.action || outcome.action === TURNSTILE_ACTION);
  } catch {
    return false;
  }
}

async function sendViaAppsScript(enquiry, env) {
  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.APPS_SCRIPT_SHARED_SECRET, enquiry }),
      redirect: 'follow', // Apps Script answers via a redirect to script.googleusercontent.com
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, code: `apps_script_http_${res.status}` };
    const result = await res.json().catch(() => null);
    return result && result.ok === true ? { ok: true } : { ok: false, code: `apps_script_${(result && result.error) || 'bad_response'}` };
  } catch (err) {
    return { ok: false, code: err && err.name === 'TimeoutError' ? 'apps_script_timeout' : 'apps_script_unreachable' };
  }
}

export async function handleEnquiry(request, env) {
  if (!isConfigured(env)) return json({ ok: false, error: 'disabled' }, 503);

  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json({ ok: false, error: 'forbidden' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'unsupported_media_type' }, 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'bad_request' }, 400);

  // Simple bot checks: the hidden field is only filled in by bots, and people take more than a few seconds.
  if (body.website) return json({ ok: false, error: 'rejected' }, 400);
  if (!(Number(body.elapsedMs) >= MIN_FILL_MS)) return json({ ok: false, error: 'too_fast' }, 400);

  const { enquiry, errors } = validateEnquiry(body);
  if (errors) return json({ ok: false, error: 'invalid', fields: errors }, 422);

  if (!(await verifyTurnstile(body.turnstileToken, request, env))) return json({ ok: false, error: 'verification_failed' }, 403);

  const sent = await sendViaAppsScript(enquiry, env);
  if (!sent.ok) {
    console.error(`enquiry_send_failed ${sent.code}`); // error code only; never customer details
    return json({ ok: false, error: 'send_failed' }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/enquiry/config') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'method_not_allowed' }, 405);
      const enabled = isConfigured(env);
      return json({ enabled, turnstileSiteKey: enabled ? env.TURNSTILE_SITE_KEY : '' });
    }
    if (pathname === '/api/enquiry') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
      return handleEnquiry(request, env);
    }
    if (pathname.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
