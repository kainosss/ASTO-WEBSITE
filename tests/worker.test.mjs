// ASTO Security: unit tests for the enquiry Worker (worker/index.js).
// Run: node tests/worker.test.mjs   (Node 20+). Turnstile and Apps Script are mocked; nothing real is called.
import assert from 'node:assert/strict';
import worker, { validateEnquiry, isConfigured, configIssues } from '../worker/index.js';

const ORIGIN = 'https://claude-dazzling-meitner-k2g3cu-asto-website.kainerpersonal.workers.dev';
const APPS_URL = 'https://script.google.com/macros/s/TESTDEPLOYMENTID_abc-123/exec';
const SECRET = 'x'.repeat(40);
const ENV = {
  FORM_ENABLED: 'true',
  TURNSTILE_SITE_KEY: 'site-key',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  APPS_SCRIPT_URL: APPS_URL,
  APPS_SCRIPT_SHARED_SECRET: SECRET,
  ASSETS: { fetch: () => new Response('asset') },
};
const VALID = {
  service: 'Intruder alarms', name: 'Test Person', email: 'Test.Person@Example.com', phone: '0400 000 000',
  suburb: 'Carindale', property_type: 'Residential', message: 'The alarm beeps every night.',
  website: '', elapsedMs: 9000, turnstileToken: 'token-ok',
};

// ---- fetch mock: Turnstile siteverify + Apps Script ----
let calls = [];
let turnstileReply = { success: true, hostname: new URL(ORIGIN).hostname, action: 'enquiry' };
let appsReply = () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).startsWith('https://challenges.cloudflare.com/')) return new Response(JSON.stringify(turnstileReply));
  if (String(url) === APPS_URL) return appsReply();
  throw new Error(`unexpected fetch ${url}`);
};
const logs = [];
for (const k of ['log', 'info', 'warn', 'error']) console[k] = (...a) => logs.push(a.join(' '));

const post = (body, { env = ENV, origin = ORIGIN, type = 'application/json', raw } = {}) => worker.fetch(new Request(`${ORIGIN}/api/enquiry`, {
  method: 'POST',
  headers: { 'content-type': type, ...(origin ? { origin } : {}), 'cf-connecting-ip': '203.0.113.9' },
  body: raw ?? JSON.stringify(body),
}), env);
const read = async res => ({ status: res.status, body: await res.json() });

let passed = 0, failed = 0;
async function test(name, fn) {
  calls = []; turnstileReply = { success: true, hostname: new URL(ORIGIN).hostname, action: 'enquiry' };
  appsReply = () => new Response(JSON.stringify({ ok: true }));
  try { await fn(); passed++; process.stdout.write(`PASS ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
}

await test('config endpoint: disabled unless FORM_ENABLED and all secrets are set', async () => {
  for (const env of [{}, { ...ENV, FORM_ENABLED: 'false' }, { ...ENV, TURNSTILE_SECRET_KEY: '' }, { ...ENV, APPS_SCRIPT_SHARED_SECRET: 'short' }, { ...ENV, APPS_SCRIPT_URL: 'https://evil.example/exec' }]) {
    const r = await read(await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), env));
    assert.equal(r.body.enabled, false); assert.equal(r.body.turnstileSiteKey, '');
  }
  const r = await read(await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), ENV));
  assert.deepEqual(r.body, { enabled: true, turnstileSiteKey: 'site-key' }, 'no diagnostics once enabled');
});
await test('disabled form (production default) refuses submissions with 503 and calls nothing', async () => {
  const r = await read(await post(VALID, { env: { ASSETS: ENV.ASSETS } }));
  assert.equal(r.status, 503); assert.equal(r.body.ok, false); assert.equal(calls.length, 0);
});
await test('rejects other methods and unknown API paths', async () => {
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/enquiry`), ENV)).status, 405);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/other`), ENV)).status, 404);
});
await test('non-API paths are served from static assets', async () => {
  assert.equal(await (await worker.fetch(new Request(`${ORIGIN}/`), ENV)).text(), 'asset');
});
await test('rejects cross-site or missing Origin', async () => {
  assert.equal((await post(VALID, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(VALID, { origin: '' })).status, 403);
  assert.equal(calls.length, 0);
});
await test('rejects non-JSON, malformed and oversized bodies', async () => {
  assert.equal((await post(VALID, { type: 'text/plain' })).status, 415);
  assert.equal((await post(null, { raw: '{not json' })).status, 400);
  assert.equal((await post(null, { raw: JSON.stringify({ ...VALID, message: 'a'.repeat(12000) }) })).status, 413);
  assert.equal(calls.length, 0);
});
await test('honeypot and too-fast submissions are rejected before any verification', async () => {
  assert.equal((await post({ ...VALID, website: 'http://spam' })).status, 400);
  assert.equal((await post({ ...VALID, elapsedMs: 500 })).status, 400);
  assert.equal((await post({ ...VALID, elapsedMs: undefined })).status, 400);
  assert.equal(calls.length, 0);
});
await test('server-side validation: allowlists, lengths, email and phone formats', async () => {
  const bad = { ...VALID, service: 'Access control', property_type: 'Industrial', email: 'nope', phone: 'call me', suburb: '', name: '', message: 'short' };
  const r = await read(await post(bad));
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.body.fields).sort(), ['email', 'message', 'name', 'phone', 'property_type', 'service', 'suburb']);
  assert.equal(calls.length, 0);
  assert.ok(validateEnquiry({ ...VALID, phone: '' }).enquiry, 'phone is optional');
});
await test('header injection: newlines are stripped from single-line fields', async () => {
  const { enquiry } = validateEnquiry({ ...VALID, suburb: 'Carindale\r\nBcc: victim@example.com', name: 'A\nB' });
  assert.ok(!/[\r\n]/.test(enquiry.suburb) && !/[\r\n]/.test(enquiry.name));
});
await test('Turnstile is mandatory and verified server-side (token, hostname, action)', async () => {
  assert.equal((await post({ ...VALID, turnstileToken: '' })).status, 403);
  turnstileReply = { success: false }; assert.equal((await post(VALID)).status, 403);
  turnstileReply = { success: true, hostname: 'evil.example', action: 'enquiry' }; assert.equal((await post(VALID)).status, 403);
  turnstileReply = { success: true, hostname: new URL(ORIGIN).hostname, action: 'login' }; assert.equal((await post(VALID)).status, 403);
  assert.ok(!calls.some(c => c.url === APPS_URL), 'Apps Script never called when verification fails');
});
await test('Turnstile siteverify receives the secret, token and visitor IP', async () => {
  await post(VALID);
  const form = calls.find(c => c.url.includes('siteverify')).init.body;
  assert.equal(form.get('secret'), 'turnstile-secret'); assert.equal(form.get('response'), 'token-ok'); assert.equal(form.get('remoteip'), '203.0.113.9');
});
await test('success only when Apps Script confirms; payload has secret + clean enquiry and no recipient', async () => {
  const r = await read(await post(VALID));
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });
  const sent = JSON.parse(calls.find(c => c.url === APPS_URL).init.body);
  assert.equal(sent.secret, SECRET);
  assert.deepEqual(Object.keys(sent).sort(), ['enquiry', 'secret']);
  assert.deepEqual(Object.keys(sent.enquiry).sort(), ['email', 'message', 'name', 'phone', 'property_type', 'service', 'suburb']);
  assert.equal(sent.enquiry.email, 'test.person@example.com');
  assert.ok(!('to' in sent.enquiry) && !('turnstileToken' in sent.enquiry) && !('website' in sent.enquiry));
});
await test('Apps Script failure, bad JSON, HTTP error or network error → 502, never success', async () => {
  for (const reply of [
    () => new Response(JSON.stringify({ ok: false, error: 'unauthorised' })),
    () => new Response('<html>error</html>'),
    () => new Response('{}', { status: 500 }),
    () => { throw new TypeError('network'); },
  ]) {
    appsReply = reply;
    const r = await read(await post(VALID));
    assert.equal(r.status, 502); assert.equal(r.body.ok, false);
  }
});
await test('customer details never appear in logs', async () => {
  appsReply = () => new Response(JSON.stringify({ ok: false, error: 'server_error' }));
  await post(VALID);
  const text = logs.join('\n').toLowerCase();
  for (const s of ['test person', 'test.person@example.com', '0400 000 000', 'carindale', 'beeps', SECRET]) assert.ok(!text.includes(s.toLowerCase()), `log contains "${s}"`);
});
await test('isConfigured rejects non-Apps-Script URLs', async () => {
  assert.equal(isConfigured({ ...ENV, APPS_SCRIPT_URL: 'https://script.google.com.evil.example/macros/s/x/exec' }), false);
});

// ---- Regression: production showed enabled:false with all five settings saved in the dashboard ----
await test('regression: Google Workspace web app URL (/a/macros/<domain>/s/…/exec) is accepted', async () => {
  const url = 'https://script.google.com/a/macros/astosec.com/s/AKfycbTEST_id-1/exec';
  assert.equal(isConfigured({ ...ENV, APPS_SCRIPT_URL: url }), true);
});
await test('regression: pasted whitespace/newlines, "True"/"TRUE" and a JSON boolean all count as enabled', async () => {
  for (const v of ['true', ' true ', 'true\n', 'True', 'TRUE', true]) assert.equal(isConfigured({ ...ENV, FORM_ENABLED: v }), true, JSON.stringify(v));
  for (const v of ['false', 'yes', '1', '', false]) assert.equal(isConfigured({ ...ENV, FORM_ENABLED: v }), false, JSON.stringify(v));
  assert.equal(isConfigured({ ...ENV, APPS_SCRIPT_URL: ` ${APPS_URL}\n`, TURNSTILE_SECRET_KEY: ' turnstile-secret ', APPS_SCRIPT_SHARED_SECRET: ` ${SECRET}\n` }), true);
});
await test('regression: a "?usp=sharing" suffix on the URL is ignored and never sent', async () => {
  const env = { ...ENV, APPS_SCRIPT_URL: `${APPS_URL}?usp=sharing` };
  assert.equal(isConfigured(env), true);
  assert.equal((await post(VALID, { env })).status, 200);
  assert.ok(calls.some(c => c.url === APPS_URL), 'fetches the clean /exec URL');
});
await test('regression: trimmed values are what is actually used (Turnstile secret, URL, shared secret)', async () => {
  const env = { ...ENV, TURNSTILE_SECRET_KEY: ' turnstile-secret\n', APPS_SCRIPT_URL: ` ${APPS_URL} `, APPS_SCRIPT_SHARED_SECRET: `${SECRET}\n` };
  assert.equal((await post(VALID, { env })).status, 200);
  assert.equal(calls.find(c => c.url.includes('siteverify')).init.body.get('secret'), 'turnstile-secret');
  assert.equal(JSON.parse(calls.find(c => c.url === APPS_URL).init.body).secret, SECRET);
});
await test('still rejects genuinely wrong settings', async () => {
  assert.equal(isConfigured({ ...ENV, APPS_SCRIPT_URL: 'https://script.google.com/a/macros/astosec.com/s/x/edit' }), false);
  assert.equal(isConfigured({ ...ENV, APPS_SCRIPT_URL: 'https://example.com/macros/s/x/exec' }), false);
  assert.equal(isConfigured({ ...ENV, APPS_SCRIPT_SHARED_SECRET: 'short' }), false);
  assert.deepEqual(configIssues({ ...ENV, APPS_SCRIPT_SHARED_SECRET: 'short' }), ['APPS_SCRIPT_SHARED_SECRET is shorter than 32 characters']);
});
await test('diagnostics removed: public config is only {enabled, turnstileSiteKey} in every state', async () => {
  const states = {
    'production off (no settings)': { ASSETS: ENV.ASSETS },
    'FORM_ENABLED=false': { ...ENV, FORM_ENABLED: 'false' },
    'invalid URL and short secret': { ...ENV, APPS_SCRIPT_URL: 'https://script.google.com/macros/s/SECRETID/edit', APPS_SCRIPT_SHARED_SECRET: 'tiny-secret-value' },
    'one secret missing': { ...ENV, TURNSTILE_SECRET_KEY: '' },
  };
  for (const [label, env] of Object.entries(states)) {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), env);
    const body = await res.json();
    assert.deepEqual(body, { enabled: false, turnstileSiteKey: '' }, label);
    const text = JSON.stringify(body);
    for (const leak of ['settings', 'FORM_ENABLED', 'TURNSTILE', 'APPS_SCRIPT', 'SECRETID', 'tiny-secret-value', 'turnstile-secret', 'site-key', 'missing', 'invalid'])
      assert.ok(!text.includes(leak), `${label}: response mentions "${leak}"`);
  }
  const live = await read(await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), ENV));
  assert.deepEqual(live.body, { enabled: true, turnstileSiteKey: 'site-key' }, 'enabled: only the public site key');
  const mod = await import('../worker/index.js');
  assert.ok(!('settingStatus' in mod) && !('SETUP_DIAGNOSTICS' in mod), 'diagnostics code removed');
});
await test('security: Turnstile token without the "enquiry" action is rejected', async () => {
  turnstileReply = { success: true, hostname: new URL(ORIGIN).hostname };
  assert.equal((await post(VALID)).status, 403);
  turnstileReply = { success: true, hostname: new URL(ORIGIN).hostname, action: '' };
  assert.equal((await post(VALID)).status, 403);
  assert.ok(!calls.some(c => c.url === APPS_URL), 'nothing sent');
});
await test('security: oversized body without Content-Length (chunked) is rejected before parsing', async () => {
  const big = new TextEncoder().encode(JSON.stringify({ ...VALID, message: 'a'.repeat(30000) }));
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < big.length; i += 4096) c.enqueue(big.slice(i, i + 4096)); c.close(); } });
  const req = new Request(`${ORIGIN}/api/enquiry`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: stream, duplex: 'half' });
  assert.equal(req.headers.get('content-length'), null);
  const r = await read(await worker.fetch(req, ENV));
  assert.equal(r.status, 413); assert.equal(calls.length, 0);
});
await test('security: Apps Script error codes are sanitised before logging', async () => {
  logs.length = 0;
  appsReply = () => new Response(JSON.stringify({ ok: false, error: 'bad\nInjected: test.person@example.com <script>' }));
  assert.equal((await post(VALID)).status, 502);
  const text = logs.join('\n');
  assert.ok(/^enquiry_send_failed apps_script_[a-z0-9_]+$/i.test(text.trim()), text);
  assert.ok(!text.includes('@') && !text.includes('<') && !text.includes('\n'));
});
await test('security: no CORS headers; preflight and other methods are refused', async () => {
  const pre = await worker.fetch(new Request(`${ORIGIN}/api/enquiry`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } }), ENV);
  assert.equal(pre.status, 405);
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const ok = await post(VALID);
  assert.equal(ok.headers.get('access-control-allow-origin'), null);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
});
await test('seo: every API response tells search engines not to index it', async () => {
  for (const res of [await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), ENV), await post(VALID), await worker.fetch(new Request(`${ORIGIN}/api/unknown`), ENV)]) {
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  }
});
await test('logs name the settings that need attention, never their values', async () => {
  logs.length = 0;
  await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), { ...ENV, APPS_SCRIPT_SHARED_SECRET: 'tiny-secret-value' });
  const text = logs.join('\n');
  assert.match(text, /APPS_SCRIPT_SHARED_SECRET is shorter than 32 characters/);
  for (const v of ['tiny-secret-value', 'turnstile-secret', APPS_URL, 'site-key']) assert.ok(!text.includes(v), `log leaks "${v}"`);
  logs.length = 0;
  await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), { ASSETS: ENV.ASSETS });
  assert.equal(logs.length, 0, 'nothing logged when no settings exist (production-off default)');
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
