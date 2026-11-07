// ASTO Security: browser tests for the static site.
// Run: node tests/site.test.mjs   (Node 18+, Playwright with Chromium available to `require('playwright')`)
// Safety: the enquiry API, Cloudflare Turnstile and Google are always intercepted. These tests never send a real enquiry.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
// Stand-in for Cloudflare's Turnstile script: issues a test token immediately.
const TURNSTILE_STUB = `window.turnstile = {
  render(el, o) { window.__ts = o; setTimeout(() => o.callback('test-token'), 10); return 'w1'; },
  reset() { window.__resets = (window.__resets || 0) + 1; setTimeout(() => window.__ts.callback('test-token-next'), 10); },
};
window.onAstoTurnstileLoad && window.onAstoTurnstileLoad();`;

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

// live: the Worker reports the form enabled. api: handler for POST /api/enquiry (records every call in `sent`).
async function openPage({ width = 1440, height = 900, live = false, api, config } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  const sent = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  for (const host of ['https://script.google.com/**', 'https://challenges.cloudflare.com/**']) {
    await page.route(host, route => (live && route.request().url().includes('/turnstile/v0/api.js'))
      ? route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB })
      : (sent.push(route.request()), route.abort()));
  }
  await page.route(`${BASE}/api/enquiry/config`, route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify(config || (live ? { enabled: true, turnstileSiteKey: 'test-site-key' } : { enabled: false, turnstileSiteKey: '' })) }));
  await page.route(`${BASE}/api/enquiry`, route => { sent.push(route.request()); return api ? api(route) : route.abort(); });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  if (live) await page.waitForFunction(() => document.getElementById('enquiryForm').dataset.mode === 'live');
  return { page, problems, sent };
}
const ok = route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
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

  // ---------- "Why hard-wired CCTV?" section ----------
  for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const { page, problems, sent } = await openPage({ width, height });
    const s = await page.evaluate(() => {
      const sec = document.getElementById('why-hard-wired');
      if (!sec) return null;
      const order = [...document.querySelectorAll('main > section')].map(x => x.id);
      const cta = sec.querySelector('a.button[href="#contact"]');
      return {
        afterServices: order.indexOf('why-hard-wired') === order.indexOf('services') + 1 && order.indexOf('why-hard-wired') < order.indexOf('contact'),
        labelledBy: sec.getAttribute('aria-labelledby') === 'cctv-heading' && sec.querySelector('h2#cctv-heading') !== null,
        eyebrow: sec.querySelector('.section-eyebrow')?.textContent.trim(),
        h2: sec.querySelector('h2').innerText.replace(/\s+/g, ' ').trim(),
        benefits: [...sec.querySelectorAll('.cctv-grid > li h3')].map(h => h.textContent.trim()),
        headings: [...sec.querySelectorAll('h2, h3')].map(h => h.tagName),
        iconsHidden: [...sec.querySelectorAll('svg')].every(svg => svg.closest('[aria-hidden="true"]')),
        cta: cta && cta.textContent.trim(),
        ctaVisible: cta && cta.getBoundingClientRect().width > 0,
        text: sec.textContent.replace(/\s+/g, ' '),
        forms: sec.querySelectorAll('form, input, select, textarea').length,
        overflow: [...sec.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).length,
      };
    });
    check(s !== null, `cctv ${label}: section is present`);
    if (!s) { await page.close(); continue; }
    check(s.afterServices, `cctv ${label}: placed directly after Services, before the enquiry form`);
    check(s.labelledBy && s.eyebrow === 'WHY HARD-WIRED CCTV?' && s.h2 === 'Built for reliable, everyday security.', `cctv ${label}: eyebrow and heading`, `${s.eyebrow} / ${s.h2}`);
    check(JSON.stringify(s.benefits) === JSON.stringify(['Reliable connection', 'Continuous recording', 'Local video storage', 'No battery charging']), `cctv ${label}: four benefits`, s.benefits.join(','));
    check(s.headings[0] === 'H2' && s.headings.slice(1).every(t => t === 'H3'), `cctv ${label}: heading hierarchy is h2 then h3`, s.headings.join(','));
    check(s.iconsHidden, `cctv ${label}: decorative icons hidden from screen readers`);
    check(/considered camera positioning, neat cabling/.test(s.text) && /We can recommend and install a CCTV system suited to your property, coverage needs and budget\./.test(s.text), `cctv ${label}: installation statement and CTA copy present`);
    check(/internet connection/.test(s.text) && /\(UPS\)/.test(s.text) && /wireless cameras offer local storage too/.test(s.text), `cctv ${label}: accuracy notes (remote viewing, UPS, DIY local storage) present`);
    check(!/\$\d|price|pricing|review|testimonial|guarantee|24\/7|prevent crime/i.test(s.text), `cctv ${label}: no pricing, reviews, guarantees or crime-prevention claims`);
    check(s.forms === 0 && s.overflow === 0, `cctv ${label}: no extra form and no horizontal overflow`, `${s.forms} fields, ${s.overflow} overflowing`);
    check(s.cta === 'Get a Free CCTV Quote' && s.ctaVisible, `cctv ${label}: "Get a Free CCTV Quote" button links to #contact`, s.cta);
    // Keyboard: focus the CTA and press Enter; it should take the visitor to the existing enquiry form.
    await page.focus('#why-hard-wired a.button');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#contact');
    for (let last = -1, y = 0, i = 0; i < 40 && (y = await page.evaluate(() => scrollY)) !== last; i++) { last = y; await page.waitForTimeout(150); }
    const top = await page.evaluate(() => document.getElementById('contact').getBoundingClientRect().top);
    check(Math.abs(top - (width <= 760 ? 72 : 80)) <= 2 && sent.length === 0, `cctv ${label}: keyboard activation of the CTA scrolls to the enquiry section without sending anything`, `contact top ${top}px`);
    check(problems.length === 0, `cctv ${label}: no console errors`, problems.join(' | '));
    await page.close();
  }

  // ---------- Preview mode (Worker reports the form disabled — the production default) ----------
  {
    const { page, sent } = await openPage({ width: 390, height: 844 });
    check(await page.getAttribute('#enquiryForm', 'data-mode') === 'preview', 'preview: form stays in preview mode while the Worker reports it disabled');
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
    check(sent.length === 0, 'preview: nothing is sent and Turnstile is not loaded');
    await page.close();
  }
  {
    const { page, sent } = await openPage({ config: { enabled: true, turnstileSiteKey: '' } });
    check(await page.getAttribute('#enquiryForm', 'data-mode') === 'preview' && sent.length === 0, 'preview: "enabled" without a Turnstile key still stays disabled');
    await page.close();
  }

  // ---------- Live mode: success only when the Worker confirms the email was sent ----------
  {
    const { page, sent } = await openPage({ live: true, api: ok });
    check(await page.getAttribute('#enquiryForm', 'data-mode') === 'live', 'live: form switches on when the Worker reports it enabled');
    check(!(await page.isVisible('.form-preview-note')), 'live: preview note is hidden');
    check(await page.evaluate(() => window.__ts && window.__ts.sitekey === 'test-site-key' && window.__ts.action === 'enquiry'), 'live: Turnstile rendered with the site key and "enquiry" action');
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
    check(/has been sent/.test(fb.text), 'live: success message after the server confirms', fb.text);
    const req = sent[0];
    const body = req ? JSON.parse(req.postData()) : {};
    check(req && req.method() === 'POST' && req.url() === `${BASE}/api/enquiry` && req.headers()['content-type'] === 'application/json', 'live: POSTs JSON to /api/enquiry on the same site');
    check(body.service === 'CCTV installation' && body.suburb === 'Carindale' && body.email === 'test@example.com' && body.name === 'Test Person' && body.phone === '0400 000 000' && body.property_type === 'Residential' && body.message, 'live: payload has service, name, email, phone, suburb, property type, message');
    check(body.turnstileToken === 'test-token' && body.elapsedMs >= 3000 && body.website === '', 'live: sends the Turnstile token, elapsed time and empty honeypot');
    check(!('to' in body) && !('recipient' in body), 'live: browser never chooses the recipient');
    check(await page.inputValue('#fullName') === '', 'live: form clears after a successful send');
    check(await page.evaluate(() => window.__resets) === 1, 'live: Turnstile resets after each attempt (tokens are single-use)');
    await page.close();
  }
  {
    const { page, sent } = await openPage({ live: true, api: route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }) });
    await fillValid(page); await page.waitForTimeout(3100); await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'error');
    check(sent.length === 1 && !/has been sent/.test((await feedback(page)).text), 'live: a 200 response without ok:true is not treated as success');
    await page.close();
  }
  {
    const { page, sent } = await openPage({ live: true, api: route => route.fulfill({ status: 422, contentType: 'application/json', body: '{"ok":false,"error":"invalid","fields":{"suburb":"Please enter your suburb."}}' }) });
    await fillValid(page); await page.waitForTimeout(3100); await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'error');
    const fb = await feedback(page);
    check(sent.length === 1 && !/has been sent/.test(fb.text) && /could not be sent/.test(fb.text), 'live: rejected submission shows an error, not success', fb.text);
    check(await page.getAttribute('#suburb', 'aria-invalid') === 'true', 'live: server field errors are shown on the field');
    check(await page.inputValue('#fullName') === 'Test Person', 'live: details are kept after an error');
    check(await page.isEnabled('#formSubmit'), 'live: button re-enabled after an error');
    await page.close();
  }
  {
    const { page } = await openPage({ live: true, api: route => route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"error":"send_failed"}' }) });
    await fillValid(page); await page.waitForTimeout(3100); await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'error');
    check(/could not be sent/.test((await feedback(page)).text) && await page.inputValue('#message') !== '', 'live: email delivery failure shows an error and keeps the details');
    await page.close();
  }
  {
    const { page } = await openPage({ live: true, api: route => route.abort('internetdisconnected') });
    await fillValid(page); await page.waitForTimeout(3100); await page.click('#formSubmit');
    await page.waitForFunction(() => document.getElementById('formFeedback').dataset.state === 'error');
    const fb = await feedback(page);
    check(/internet connection/.test(fb.text) && await page.inputValue('#message') !== '', 'live: network failure shows an error and keeps the details', fb.text);
    await page.close();
  }
  {
    const { page, sent } = await openPage({ live: true, api: ok });
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
    const urls = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    }));
    check(urls.canonical === 'https://astosec.com/' && urls.ogUrl === 'https://astosec.com/', 'seo: canonical and og:url point to https://astosec.com/');
    check(urls.ogImage === 'https://astosec.com/assets/og-image.jpg', 'seo: og:image is an absolute https URL on astosec.com');
    const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
    check(/<urlset[^>]+sitemaps\.org/.test(sitemap) && sitemap.includes('<loc>https://astosec.com/</loc>') && sitemap.includes('<loc>https://astosec.com/privacy</loc>') && !/YOUR-DOMAIN/.test(sitemap), 'seo: sitemap.xml lists the home and privacy pages on astosec.com');
    const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
    check(/^Sitemap: https:\/\/astosec\.com\/sitemap\.xml$/m.test(robots) && /^Allow: \/$/m.test(robots), 'seo: robots.txt allows crawling and names the sitemap');
    const { readFileSync } = await import('node:fs');
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8').split('\n').filter(l => !l.startsWith('#'));
    const has = h => headers.some(l => l.trim().startsWith(h));
    check(has('X-Robots-Tag: noindex, nofollow'), 'launch guard: noindex header still present (remove only with owner approval)');
    check(['X-Content-Type-Options: nosniff', 'Referrer-Policy:', 'X-Frame-Options: DENY', 'Permissions-Policy:', 'Content-Security-Policy-Report-Only:'].every(has), 'security headers present in _headers (CSP report-only)');
    check(headers.every(l => !l.trim() || l.startsWith('/') || /^\s+[A-Za-z-]+: \S/.test(l)), '_headers has only rule lines and header lines (no comments inside the rule)');
    for (const path of ['/privacy.html', '/robots.txt', '/assets/og-image.jpg', '/assets/branding/apple-touch-icon.png', '/assets/branding/asto-favicon-tab.svg']) {
      const r = await page.request.get(`${BASE}${path}`);
      check(r.status() === 200, `asset: ${path} is served`);
    }
    const nf = await page.request.get(`${BASE}/no-such-page`);
    check(nf.status() === 404 && /Page not found/.test(await nf.text()), 'unknown URLs show the 404 page');
    await page.goto(`${BASE}/privacy.html`, { waitUntil: 'networkidle' });
    const main = await page.textContent('main');
    check(await page.textContent('h1') === 'Privacy notice' && /Google Workspace/.test(main) && /Turnstile/.test(main) && !/Formspree/.test(main), 'privacy notice names Google Workspace and Turnstile (no Formspree)');
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
