// ASTO Security: tests for the Google Apps Script mailer (docs/apps-script/Code.gs).
// Run: node tests/apps-script.test.mjs. Google services are faked; no email is sent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../docs/apps-script/Code.gs', import.meta.url), 'utf8');
const SECRET = 'S'.repeat(48);
const ENQUIRY = { service: 'CCTV installation', name: 'Test Person', email: 'test@example.com', phone: '', suburb: 'Carindale', property_type: 'Residential', message: 'Two cameras for the driveway.' };

function load({ secret = SECRET, mailThrows = false } = {}) {
  const props = new Map(secret ? [['SHARED_SECRET', secret]] : []);
  const sent = [], logs = [];
  const ctx = {
    MailApp: { sendEmail: m => { if (mailThrows) throw new Error('quota'); sent.push(m); }, getRemainingDailyQuota: () => 1500 },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: k => props.delete(k), getKeys: () => [...props.keys()] }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-11-03' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    console: { error: (...a) => logs.push(a.join(' ')), log: (...a) => logs.push(a.join(' ')) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  return { ctx, post, sent, logs, props };
}

let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); } };

test('valid request emails the fixed recipient with the customer as Reply-To', () => {
  const { post, sent } = load();
  assert.deepEqual(post({ secret: SECRET, enquiry: ENQUIRY }), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'admin@astosec.com');
  assert.equal(sent[0].replyTo, 'test@example.com');
  assert.equal(sent[0].name, 'ASTO Security website');
  assert.equal(sent[0].subject, 'New ASTO enquiry: CCTV installation – Carindale');
  assert.match(sent[0].body, /Phone:\s+Not supplied/);
});
test('requests cannot choose the recipient', () => {
  const { post, sent } = load();
  post({ secret: SECRET, to: 'attacker@example.com', enquiry: { ...ENQUIRY, to: 'attacker@example.com', recipient: 'x@example.com' } });
  assert.equal(sent[0].to, 'admin@astosec.com');
  assert.ok(!JSON.stringify(sent[0]).includes('attacker@example.com'));
});
test('wrong, missing or short shared secret is refused and nothing is sent', () => {
  for (const body of [{ secret: 'wrong', enquiry: ENQUIRY }, { enquiry: ENQUIRY }, { secret: SECRET.slice(1), enquiry: ENQUIRY }]) {
    const { post, sent } = load();
    assert.deepEqual(post(body), { ok: false, error: 'unauthorised' });
    assert.equal(sent.length, 0);
  }
  const unset = load({ secret: 'too-short' });
  assert.equal(unset.post({ secret: 'too-short', enquiry: ENQUIRY }).error, 'unauthorised', 'secrets under 32 characters are never accepted');
});
test('invalid enquiries are refused (server-side validation repeated)', () => {
  for (const bad of [{ ...ENQUIRY, service: 'Access control' }, { ...ENQUIRY, email: 'nope' }, { ...ENQUIRY, message: 'short' }, { ...ENQUIRY, suburb: '' }, null]) {
    const { post, sent } = load();
    assert.equal(post({ secret: SECRET, enquiry: bad }).ok, false);
    assert.equal(sent.length, 0);
  }
});
test('newlines cannot reach the subject line', () => {
  const { post, sent } = load();
  post({ secret: SECRET, enquiry: { ...ENQUIRY, suburb: 'Carindale\nBcc: x@example.com' } });
  assert.ok(!/[\r\n]/.test(sent[0].subject));
});
test('malformed and oversized requests are refused', () => {
  const { post, sent } = load();
  assert.equal(post('{oops').error, 'bad_request');
  assert.equal(post('x'.repeat(20001)).error, 'bad_request');
  assert.equal(sent.length, 0);
});
test('daily safety cap stops sending after 50 emails', () => {
  const { post, sent } = load();
  for (let i = 0; i < 50; i++) assert.equal(post({ secret: SECRET, enquiry: ENQUIRY }).ok, true);
  assert.deepEqual(post({ secret: SECRET, enquiry: ENQUIRY }), { ok: false, error: 'daily_limit' });
  assert.equal(sent.length, 50);
});
test('mail failures report an error (never success) and log no customer details', () => {
  const { post, logs } = load({ mailThrows: true });
  assert.deepEqual(post({ secret: SECRET, enquiry: ENQUIRY }), { ok: false, error: 'server_error' });
  const text = logs.join('\n');
  for (const s of ['Test Person', 'test@example.com', 'Carindale', SECRET]) assert.ok(!text.includes(s));
});
test('regression: whitespace around the stored or sent secret is tolerated', () => {
  const { post, sent } = load({ secret: SECRET + '\n' });
  assert.deepEqual(post({ secret: ' ' + SECRET, enquiry: ENQUIRY }), { ok: true });
  assert.equal(sent.length, 1);
});
test('GET requests are refused', () => {
  const { ctx } = load();
  assert.equal(JSON.parse(ctx.doGet().text).error, 'method_not_allowed');
});
test('manifest requests only the send-mail permission', () => {
  const manifest = JSON.parse(readFileSync(new URL('../docs/apps-script/appsscript.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/script.send_mail']);
  assert.ok(!CODE.includes('GmailApp'), 'uses MailApp, not GmailApp');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
