// ASTO Security: unit tests for the enquiry Worker (worker/index.js).
// Run: node tests/worker.test.mjs   (Node 20+). Turnstile and Apps Script are mocked; nothing real is called.
import assert from 'node:assert/strict';
import worker, { validateEnquiry, isConfigured } from '../worker/index.js';

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
    assert.deepEqual(r.body, { enabled: false, turnstileSiteKey: '' });
  }
  const r = await read(await worker.fetch(new Request(`${ORIGIN}/api/enquiry/config`), ENV));
  assert.deepEqual(r.body, { enabled: true, turnstileSiteKey: 'site-key' });
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

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
