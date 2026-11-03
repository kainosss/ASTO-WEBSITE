# ASTO Security website

Responsive, one-page, original static website designed for **Brisbane residential and small-commercial security**. Services: CCTV, intruder alarms, preventative maintenance.

## How to preview

Open `public/index.html` in a browser, or run `python3 -m http.server 8000 --directory public` and visit `http://localhost:8000`. Keep everything inside `public/` together. The hero photograph is a locally bundled optimized WebP file; it doesn't need an internet connection. Online Google Fonts are optional; system fonts are used as a fallback.

## Before publishing

1. **Connect the enquiry form:** follow `docs/enquiry-form-setup.md` (Cloudflare Worker + Turnstile + Google Apps Script, emailing admin@astosec.com). Until the Worker's secrets are set, the form stays clearly marked "not connected yet" and sends nothing. Once connected, it shows a success message only after the email has been accepted.
2. Verify and publish only the applicable Queensland security licensing and business details. Security equipment installation/servicing generally requires an individual security equipment installer licence; the requirements for a separate firm licence depend on the business structure (the Queensland Government describes a sole-trader exemption for a person who performs all the security work personally). Review current rules before trading.
3. Check your employment contract and any outside-work/conflict requirements before public marketing or accepting work. Do not use photos or client references from an employer without permission.
4. Check the final business name and domain, then connect a proper mailbox. Review the privacy notice (`public/privacy.html`).
5. Replace the demonstration photo with a permissioned project photograph if desired. The included scene is a **synthetic illustrative image**, not an ASTO completed installation. Do not caption it as a completed job.
6. Review the claims and services for accuracy before publication. No invented testimonials, emergency response, monitoring or licensing claims have been added.

## Files

Everything in `public/` is the website and is the only folder Cloudflare serves. Repository files such as this README and `CLAUDE.md` are never published.

- `public/index.html`: layout, content, navigation
- `public/styles.css`: appearance, responsive breakpoints, accessibility
- `public/config.js`: optional contact email to show beside the form (no secrets; the form is switched on by the Worker)
- `worker/index.js`: Cloudflare Worker for `/api/enquiry` (validation, Turnstile verification, forwarding to Apps Script); everything else is served from `public/`
- `docs/apps-script/`: the Google Apps Script mailer (`Code.gs`, `appsscript.json`), pasted into script.google.com by the owner
- `public/script.js`: mobile navigation, scroll effects, year, enquiry form (validation, Turnstile, honeypot, sending/success/error states)
- `public/privacy.html`: privacy notice for enquiry collection; `public/404.html`: not-found page
- `public/robots.txt`: allows crawling (so the noindex header is seen); sitemap line added at launch
- `public/assets/og-image.jpg`: 1200×630 sharing preview; `public/assets/branding/apple-touch-icon.png`: home-screen icon
- `public/_headers`: pre-launch `noindex` header for all pages (remove only at approved launch)
- `public/assets/asto-home-hero-v3.webp`: AI-generated illustrative hero background (photograph-style, no baked-in text); not genuine on-site photography, a customer site or an ASTO installation
- `public/assets/branding/`: proposed Concept 1 vector logos (geometric A, forest green and sage); `asto-favicon-tab.svg` (geometric A on a forest-green rounded square, tuned for 16–32px tabs) is the site favicon; the header and footer use the inlined `asto-horizontal-dark.svg` and `asto-horizontal-light.svg`
- `wrangler.jsonc`: Cloudflare Workers config (Worker `asto-website`: script `worker/index.js` for `/api/*`, static files from `./public`, 404 page for unknown URLs); required for pull-request preview builds. Secrets live in Cloudflare, never here
- `docs/enquiry-form-setup.md`: step-by-step setup of Apps Script, Turnstile, the Cloudflare dashboard settings and end-to-end testing
- `docs/launch-checklist.md`: every manual setup step before launch (enquiry form, business details, domain, indexing)
- `docs/enquiry-workflow.md`: how enquiries arrive, email filters, reply templates
- `docs/business-templates/`: printable quote, invoice, CCTV/alarm handover and maintenance report templates (not served)
- `docs/launch/sitemap.template.xml`: sitemap to publish at launch with the real domain
- `tests/site.test.mjs`: browser tests (`node tests/site.test.mjs`; needs Node 18+ and Playwright with Chromium)
- `tests/worker.test.mjs`, `tests/apps-script.test.mjs`: unit tests for the Worker and the Apps Script mailer (`node tests/<file>`; Node 20+)
- All tests intercept the enquiry API, Turnstile and Google, so they never send real enquiries

## Inspiration / research

The visual approach drew on contemporary security sites and redesign case studies for their clear service architecture and conversion paths, not their copyrighted designs or images. Helpful references:
- [Eversafe Security website design case study](https://www.scorchedmedia.com.au/portfolio-items/eversafe-security/)
- [Eveready Alarms redesign case study](https://lmtdev.com.au/eveready-alarms/)
- [Sectacom website design case study](https://uniwebau.com/website-portfolio/sectacom/)

Queensland licensing information: [Security equipment installer licence](https://www.qld.gov.au/community/fair-trading/regulated-industries-licensing-and-legislation/security-industry-regulation/security-technical-licence/apply-for-a-security-equipment-installer-licence) and [Security firm licence](https://www.qld.gov.au/community/fair-trading/regulated-industries-licensing-and-legislation/security-industry-regulation/managing-a-security-firm/apply-for-a-security-firm-licence).
