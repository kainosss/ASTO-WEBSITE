/*
 * ASTO SECURITY — Cloudflare Worker for the website enquiry form.
 *
 * Routes (all other requests are served from ./public by the static-assets binding):
 *   GET  /api/enquiry/config  → { enabled, turnstileSiteKey }  (tells the page whether the form is live)
 *   POST /api/enquiry         → validates, verifies Turnstile, forwards to Google Apps Script, which emails
 *                               admin@astosec.com (recipient is fixed inside Apps Script, not here).
 *
 * Configuration (Cloudflare secrets; never committed to the repository):
 *   FORM_ENABLED              "true" to accept enquiries (any capitalisation; spaces ignored). Anything else keeps it off.
 *   TURNSTILE_SITE_KEY        public Turnstile site key (sent to the browser)
 *   TURNSTILE_SECRET_KEY      private Turnstile secret key
 *   APPS_SCRIPT_URL           the Apps Script web app URL (…/macros/s/…/exec or …/a/macros/<domain>/s/…/exec)
 *   APPS_SCRIPT_SHARED_SECRET random string (32+ characters) also stored in the Apps Script's properties
 *
 * Privacy: this Worker never logs names, emails, phone numbers, messages or setting values. Logs contain only
 * short error codes and, when the form is off, the names (never values) of settings that keep it off. Those
 * names appear only in the owner's Cloudflare Workers Logs, never in any response to visitors.
 */

export const SERVICES = ['CCTV installation', 'Intruder alarms', 'Preventative maintenance', 'General enquiry'];
export const PROPERTY_TYPES = ['Residential', 'Small business'];
export const LIMITS = { name: 100, email: 160, phone: 20, suburb: 60, message: 2000 };
const MAX_BODY_BYTES = 10_000;
const MIN_FILL_MS = 3000;
const TURNSTILE_ACTION = 'enquiry';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Apps Script web app URLs come in two forms; Google Workspace accounts usually get the second:
//   https://script.google.com/macros/s/<id>/exec
//   https://script.google.com/a/macros/<domain>/s/<id>/exec
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
const PHONE = /^[0-9+()\s-]{8,20}$/;

// API responses are never cached or listed by search engines.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' },
});

const SETTING_NAMES = ['FORM_ENABLED', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'APPS_SCRIPT_URL', 'APPS_SCRIPT_SHARED_SECRET'];

/**
 * Read the five dashboard settings, tolerating what the dashboard commonly adds when values are pasted:
 * surrounding spaces or line breaks, "True"/"TRUE", a JSON-type boolean, and a "?usp=…" suffix on the URL.
 */
export function readSettings(env) {
  const get = name => (env && env[name] != null ? String(env[name]).trim() : '');
  const url = get('APPS_SCRIPT_URL').replace(/[?#].*$/, '');
  return {
    formEnabled: get('FORM_ENABLED').toLowerCase() === 'true',
    turnstileSiteKey: get('TURNSTILE_SITE_KEY'),
    turnstileSecretKey: get('TURNSTILE_SECRET_KEY'),
    appsScriptUrl: APPS_SCRIPT_URL.test(url) ? url : '',
    appsScriptUrlPresent: Boolean(url),
    sharedSecret: get('APPS_SCRIPT_SHARED_SECRET'),
  };
}

/** Names (never values) of settings that keep the form disabled. Empty array = form can be enabled. */
export function configIssues(env) {
  const s = readSettings(env);
  const issues = [];
  if (!s.formEnabled) issues.push('FORM_ENABLED is not "true"');
  if (!s.turnstileSiteKey) issues.push('TURNSTILE_SITE_KEY is missing');
  if (!s.turnstileSecretKey) issues.push('TURNSTILE_SECRET_KEY is missing');
  if (!s.appsScriptUrlPresent) issues.push('APPS_SCRIPT_URL is missing');
  else if (!s.appsScriptUrl) issues.push('APPS_SCRIPT_URL is not an Apps Script web app URL ending in /exec');
  if (!s.sharedSecret) issues.push('APPS_SCRIPT_SHARED_SECRET is missing');
  else if (s.sharedSecret.length < 32) issues.push('APPS_SCRIPT_SHARED_SECRET is shorter than 32 characters');
  return issues;
}

export function isConfigured(env) {
  return configIssues(env).length === 0;
}

// When at least one setting has been added but the form is still off, log which settings need attention
// (names only, never values). This goes only to the owner's Cloudflare Workers Logs, never to visitors.
function logConfigIssues(env, issues) {
  if (issues.length && SETTING_NAMES.some(name => env && env[name] != null && String(env[name]).trim() !== '')) {
    console.warn(`enquiry_form_disabled: ${issues.join('; ')}`);
  }
}

// Read at most `limit` bytes of the body, even when no Content-Length header is sent (chunked uploads).
// Returns null when the body is larger than the limit.
async function readBodyCapped(request, limit) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
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

async function verifyTurnstile(token, request, settings) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', settings.turnstileSecretKey);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    const outcome = await res.json();
    // The token must be valid, issued for this exact hostname and for the enquiry form's action.
    return outcome.success === true
      && outcome.hostname === new URL(request.url).hostname
      && outcome.action === TURNSTILE_ACTION;
  } catch {
    return false;
  }
}

async function sendViaAppsScript(enquiry, settings) {
  try {
    const res = await fetch(settings.appsScriptUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: settings.sharedSecret, enquiry }),
      redirect: 'follow', // Apps Script answers via a redirect to script.googleusercontent.com
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, code: `apps_script_http_${res.status}` };
    const result = await res.json().catch(() => null);
    if (result && result.ok === true) return { ok: true };
    const reason = String((result && result.error) || 'bad_response').replace(/[^a-z0-9_]/gi, '').slice(0, 40) || 'bad_response';
    return { ok: false, code: `apps_script_${reason}` };
  } catch (err) {
    return { ok: false, code: err && err.name === 'TimeoutError' ? 'apps_script_timeout' : 'apps_script_unreachable' };
  }
}

export async function handleEnquiry(request, env) {
  const issues = configIssues(env);
  if (issues.length) {
    logConfigIssues(env, issues);
    return json({ ok: false, error: 'disabled' }, 503);
  }
  const settings = readSettings(env);

  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json({ ok: false, error: 'forbidden' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'unsupported_media_type' }, 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);

  const raw = await readBodyCapped(request, MAX_BODY_BYTES);
  if (raw === null) return json({ ok: false, error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'bad_request' }, 400);

  // Simple bot checks: the hidden field is only filled in by bots, and people take more than a few seconds.
  if (body.website) return json({ ok: false, error: 'rejected' }, 400);
  if (!(Number(body.elapsedMs) >= MIN_FILL_MS)) return json({ ok: false, error: 'too_fast' }, 400);

  const { enquiry, errors } = validateEnquiry(body);
  if (errors) return json({ ok: false, error: 'invalid', fields: errors }, 422);

  if (!(await verifyTurnstile(body.turnstileToken, request, settings))) return json({ ok: false, error: 'verification_failed' }, 403);

  const sent = await sendViaAppsScript(enquiry, settings);
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
      const issues = configIssues(env);
      logConfigIssues(env, issues);
      const enabled = issues.length === 0;
      // Public response: only whether the form is on and, when it is, the public Turnstile site key.
      return json({ enabled, turnstileSiteKey: enabled ? readSettings(env).turnstileSiteKey : '' });
    }
    if (pathname === '/api/enquiry') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
      return handleEnquiry(request, env);
    }
    if (pathname.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
