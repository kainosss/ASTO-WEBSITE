// ASTO Security: browser tests for the static site.
// Run: node tests/site.test.mjs   (Node 18+, Playwright with Chromium available to `require('playwright')`)
// Safety: every request to formspree.io is intercepted. These tests never send a real enquiry.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
const TEST_ENDPOINT = 'https://formspree.io/f/testform123';

// Static server that mimics the Cloudflare setup closely enough: unknown paths get 404.html with a 404 status.
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  try {
    if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw new Error('missing');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(await readFile(join(ROOT, '404.html')));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let passed = 0, failed = 0;
const check = (ok, name, detail = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`); };

const browser = await chromium.launch();

async function openPage({ width = 1440, height = 900, live = false, formspree } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  const sent = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.route('https://formspree.io/**', route => { sent.push(route.request()); return formspree ? formspree(route) : route.abort(); });
  if (live) await page.route(`${BASE}/config.js`, route => route.fulfill({ contentType: 'text/javascript', body: `window.ASTO_CONFIG={formEndpoint:'${TEST_ENDPOINT}',contactEmail:''};` }));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  return { page, problems, sent };
}
async function fillValid(page) {
  await page.fill('#fullName', 'Test Person');
  await page.fill('#email', 'test@example.com');
  await page.fill('#phone', '0400 000 000');
  await page.fill('#suburb', 'Carindale');
  await page.selectOption('#service', 'CCTV installation');
  await page.selectOption('#property', 'Residential');
  await page.fill('#message', 'Two cameras for the driveway, please.');
}
const feedback = page => page.evaluate(() => { const f = document.getElementById('formFeedback'); return { text: f.textContent, state: f.dataset.state || '' }; });

try {
  // ---------- Layout, navigation and content at several widths ----------
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 820, 1000], ['mobile', 390, 844], ['small', 320, 700]]) {
    const { page, problems } = await openPage({ width, height });
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      h1: document.querySelectorAll('h1').length,
      missingTargets: [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h)),
      unlabeled: [...document.querySelectorAll('#enquiryForm input:not([name="_gotcha"]), #enquiryForm select, #enquiryForm textarea')].filter(el => !document.querySelector(`label[for="${el.id}"]`)).map(el => el.id),
      dupIds: (() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); })(),
    }));
    check(r.overflow <= 0, `${label}: no horizontal overflow`, `${r.overflow}px`);
    check(r.h1 === 1, `${label}: exactly one h1`);
    check(r.missingTargets.length === 0, `${label}: every in-page link has a target`, r.missingTargets.join(','));
    check(r.unlabeled.length === 0 && r.dupIds.length === 0, `${label}: form fields labelled, ids unique`, [...r.unlabeled, ...r.dupIds].join(','));
    if (width <= 760) {
      await page.click('#mobileToggle');
      check(await page.getAttribute('#mobileToggle', 'aria-expanded') === 'true', `${label}: mobile menu opens`);
      await page.keyboard.press('Escape');
      check(await page.getAttribute('#mobileToggle', 'aria-expanded') === 'false', `${label}: Escape closes the menu`);
      const small = await page.evaluate(() => [...document.querySelectorAll('.footer a')].filter(a => a.getBoundingClientRect().height < 24).map(a => a.textContent.trim()));
      check(small.length === 0, `${label}: footer links are at least 24px tall`, small.join(','));
    }
    const faq = page.locator('#faq details').first();
    await faq.locator('summary').click();
    check(await faq.evaluate(d => d.open), `${label}: FAQ opens`);
    check(problems.length === 0, `${label}: no console errors or failed requests`, problems.join(' | '));
    await page.close();
  }

  // ---------- Preview mode (no endpoint configured): never sends, never claims success ----------
  {
    const { page, sent } = await openPage({ width: 390, height: 844 });
    check(await page.getAttribute('#enquiryForm', 'data-mode') === 'preview', 'preview: form is in preview mode while formEndpoint is empty');
    check(await page.isVisible('.form-preview-note'), 'preview: "not connected yet" note is visible');
    await page.click('#formSubmit');
    const invalid = await page.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map(e => e.id));
    check(invalid.includes('fullName') && invalid.includes('suburb') && invalid.includes('service'), 'preview: empty submit flags required fields', invalid.join(','));
    check(await page.evaluate(() => document.activeElement.id) === 'fullName', 'preview: focus moves to the first invalid field');
    check(await page.isVisible('#email-error'), 'preview: inline error text is shown');
    await fillValid(page);
    await page.fill('#email', 'not-an-email');
    await page.click('#formSubmit');
    check(await page.getAttribute('#email', 'aria-invalid') === 'true', 'preview: invalid email is rejected');
    await page.fill('#email', 'test@example.com');
    await page.waitForTimeout(3100);
    await page.click('#formSubmit');
    const fb = await feedback(page);
    check(fb.state === 'preview' && /not connected/.test(fb.text) && !/has been sent/.test(fb.text), 'preview: submit explains nothing was sent', fb.text);
    check(sent.length === 0, 'preview: no request is made to Formspree');
    await page.close();
  }

  // ---------- Live mode: genuine acceptance only ----------
  {
    const { page, sent } = await openPage({ live: true, formspree: route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) });
    check(await page.getAttribute('#enquiryForm', 'data-mode') === 'live', 'live: form switches to live mode with a Formspree endpoint');
    check(!(await page.isVisible('.form-preview-note')), 'live: preview note is hidden');
    await page.click('.customer-home a[data-property]');
    check(await page.inputValue('#property') === 'Residential', 'live: "Enquire about home security" pre-selects Residential');
    await fillValid(page);
    await page.click('#formSubmit');
    let fb = await feedback(page);
    check(sent.length === 0 && fb.state === 'error', 'live: a submission within 3 seconds is held back (anti-spam)', fb.text);
    await page.waitForTimeout(3100);
    await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'success');
    fb = await feedback(page);
    check(/has been sent/.test(fb.text), 'live: success message after Formspree accepts', fb.text);
    const req = sent[0];
    const body = req ? JSON.parse(req.postData()) : {};
    check(req && req.method() === 'POST' && req.url() === TEST_ENDPOINT && req.headers()['accept'] === 'application/json', 'live: POSTs JSON to the configured endpoint');
    check(body.service === 'CCTV installation' && body.suburb === 'Carindale' && body.email === 'test@example.com' && body.name === 'Test Person' && body.phone && body.property_type === 'Residential' && body.message, 'live: payload has service, name, email, phone, suburb, property type, message');
    check(body._subject === 'New ASTO enquiry: CCTV installation – Carindale', 'live: subject identifies the service and suburb', body._subject);
    check(!('_gotcha' in body), 'live: honeypot is not sent');
    check(await page.inputValue('#fullName') === '', 'live: form clears after a successful send');
    await page.close();
  }
  {
    const { page, sent } = await openPage({ live: true, formspree: route => route.fulfill({ status: 422, contentType: 'application/json', body: '{"errors":[{"field":"email","message":"should be an email"}]}' }) });
    await fillValid(page); await page.waitForTimeout(3100); await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'error');
    const fb = await feedback(page);
    check(sent.length === 1 && !/has been sent/.test(fb.text) && /could not be sent/.test(fb.text), 'live: rejected submission shows an error, not success', fb.text);
    check(await page.inputValue('#fullName') === 'Test Person', 'live: details are kept after an error');
    check(await page.isEnabled('#formSubmit'), 'live: button re-enabled after an error');
    await page.close();
  }
  {
    const { page } = await openPage({ live: true, formspree: route => route.abort('internetdisconnected') });
    await fillValid(page); await page.waitForTimeout(3100); await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'error');
    const fb = await feedback(page);
    check(/internet connection/.test(fb.text) && await page.inputValue('#message') !== '', 'live: network failure shows an error and keeps the details', fb.text);
    await page.close();
  }
  {
    const { page, sent } = await openPage({ live: true, formspree: route => route.fulfill({ status: 200, body: '{}' }) });
    await fillValid(page);
    await page.evaluate(() => { document.getElementById('website').value = 'spam'; });
    await page.waitForTimeout(3100); await page.click('#formSubmit');
    const fb = await feedback(page);
    check(sent.length === 0 && fb.state === 'error', 'live: honeypot-filled submission is not sent and not reported as sent');
    await page.close();
  }

  // ---------- Other pages, SEO and sharing ----------
  {
    const { page, problems } = await openPage();
    const head = await page.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content || '',
      og: ['og:title', 'og:description', 'og:image', 'og:type'].every(p => document.querySelector(`meta[property="${p}"]`)),
      ld: (() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type']; } catch { return ''; } })(),
    }));
    check(/Brisbane/.test(head.title) && /Brisbane/.test(head.desc), 'seo: title and description mention Brisbane');
    check(head.og, 'seo: Open Graph tags present');
    check(head.ld === 'LocalBusiness', 'seo: structured data parses');
    for (const path of ['/privacy.html', '/robots.txt', '/assets/og-image.jpg', '/assets/branding/apple-touch-icon.png', '/assets/branding/asto-favicon-tab.svg']) {
      const r = await page.request.get(`${BASE}${path}`);
      check(r.status() === 200, `asset: ${path} is served`);
    }
    const nf = await page.request.get(`${BASE}/no-such-page`);
    check(nf.status() === 404 && /Page not found/.test(await nf.text()), 'unknown URLs show the 404 page');
    await page.goto(`${BASE}/privacy.html`, { waitUntil: 'networkidle' });
    check(await page.textContent('h1') === 'Privacy notice' && /Formspree/.test(await page.textContent('main')), 'privacy notice renders and names the form service');
    check(problems.length === 0, 'other pages: no console errors or failed requests', problems.join(' | '));
    await page.close();
  }
  {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(`${BASE}/`);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter(e => !e.classList.contains('is-visible')).length);
    check(hidden === 0, 'reduced motion: all sections shown immediately');
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
