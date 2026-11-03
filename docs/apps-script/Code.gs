/**
 * ASTO SECURITY: website enquiry mailer (Google Apps Script web app).
 *
 * Receives enquiries from the ASTO Cloudflare Worker and emails them to the ASTO inbox with MailApp.
 * - The recipient is fixed below. Requests cannot choose who receives email.
 * - Requests must include the shared secret stored in Script Properties as SHARED_SECRET.
 * - Customer details are never logged.
 *
 * Deploy: Deploy > New deployment > Web app; Execute as: Me (admin@astosec.com); Who has access: Anyone.
 * Setup steps: docs/enquiry-form-setup.md in the ASTO-WEBSITE repository.
 */

var RECIPIENT = 'admin@astosec.com';
var SENDER_NAME = 'ASTO Security website';
var DAILY_LIMIT = 50; // safety cap on emails per day (Brisbane time)

var SERVICES = ['CCTV installation', 'Intruder alarms', 'Preventative maintenance', 'General enquiry'];
var PROPERTY_TYPES = ['Residential', 'Small business'];
var LIMITS = { name: 100, email: 160, phone: 20, suburb: 60, message: 2000 };
var EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
var PHONE_RE = /^[0-9+()\s-]{8,20}$/;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 20000) return reply_(false, 'bad_request');
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { return reply_(false, 'bad_request'); }

    var expected = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET') || '';
    if (expected.length < 32 || !safeEqual_(String(body && body.secret || ''), expected)) return reply_(false, 'unauthorised');

    var enquiry = validate_(body.enquiry);
    if (!enquiry) return reply_(false, 'invalid');

    if (!underDailyLimit_()) return reply_(false, 'daily_limit');

    MailApp.sendEmail({
      to: RECIPIENT,
      replyTo: enquiry.email,
      name: SENDER_NAME,
      subject: 'New ASTO enquiry: ' + enquiry.service + ' – ' + enquiry.suburb,
      body: formatBody_(enquiry),
    });
    return reply_(true);
  } catch (err) {
    console.error('enquiry_mail_failed'); // no customer details in logs
    return reply_(false, 'server_error');
  }
}

function doGet() {
  return reply_(false, 'method_not_allowed');
}

function validate_(input) {
  if (!input || typeof input !== 'object') return null;
  var clean = function (v) { return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim(); };
  var e = {
    service: clean(input.service),
    name: clean(input.name),
    email: clean(input.email).toLowerCase(),
    phone: clean(input.phone),
    suburb: clean(input.suburb),
    property_type: clean(input.property_type),
    message: String(input.message == null ? '' : input.message).replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim(),
  };
  if (SERVICES.indexOf(e.service) < 0 || PROPERTY_TYPES.indexOf(e.property_type) < 0) return null;
  if (!e.name || e.name.length > LIMITS.name) return null;
  if (!EMAIL_RE.test(e.email) || e.email.length > LIMITS.email) return null;
  if (e.phone && (!PHONE_RE.test(e.phone) || e.phone.length > LIMITS.phone)) return null;
  if (!e.suburb || e.suburb.length > LIMITS.suburb) return null;
  if (e.message.length < 10 || e.message.length > LIMITS.message) return null;
  return e;
}

function formatBody_(e) {
  return [
    'New enquiry from the ASTO Security website',
    '',
    'Service:        ' + e.service,
    'Name:           ' + e.name,
    'Email:          ' + e.email,
    'Phone:          ' + (e.phone || 'Not supplied'),
    'Suburb:         ' + e.suburb,
    'Property type:  ' + e.property_type,
    '',
    'Message:',
    e.message,
    '',
    '--',
    'Reply to this email to respond to the customer directly.',
  ].join('\n');
}

function underDailyLimit_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'count_' + Utilities.formatDate(new Date(), 'Australia/Brisbane', 'yyyy-MM-dd');
    var count = Number(props.getProperty(key) || 0);
    if (count >= DAILY_LIMIT) return false;
    props.getKeys().forEach(function (k) { if (k.indexOf('count_') === 0 && k !== key) props.deleteProperty(k); });
    props.setProperty(key, String(count + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function reply_(ok, error) {
  return ContentService.createTextOutput(JSON.stringify(ok ? { ok: true } : { ok: false, error: error }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to grant the email permission and check delivery. Sends one test email to RECIPIENT. */
function sendTestEmail() {
  MailApp.sendEmail({ to: RECIPIENT, name: SENDER_NAME, subject: 'ASTO enquiry mailer: test', body: 'The ASTO enquiry mailer can send email. Remaining daily quota: ' + MailApp.getRemainingDailyQuota() });
}
