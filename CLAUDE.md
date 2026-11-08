# ASTO Security — project instructions for Claude Code

## Purpose and current status
- ASTO SECURITY is a Brisbane, Queensland electronic security business website concept.
- Audience: **residential customers and small commercial premises only** (homes, townhouses, local shops, small offices).
- Current service scope: **CCTV cameras, intruder alarms, preventative maintenance**. Do not add access control, intercoms, large commercial, industrial, or unrelated services unless explicitly requested.
- The owner is deliberately launching quietly to avoid conflicts with existing employment. Keep marketing understated, local, informative, and professional.
- This is a **concept/pre-launch website**. Do not claim the site is live, the form is connected, or the business holds a specific licence without supplied verification.

## Design direction — preserve by default
- This is the approved redesign. Improve with restraint rather than starting from scratch.
- Modern, minimalist, welcoming, and trustworthy; not aggressive or corporate.
- Visual palette: warm off-white backgrounds, deep forest-green sections, subtle muted accent tones.
- Keep generous whitespace, simple cards, readable type, light animation, and a strong photographic hero.
- Hero is a synthetic illustrative image in `public/assets/asto-home-hero-v4.webp` (AI-generated, photograph-style, background only; v4 retouches the dome camera's lower housing), **not** genuine on-site photography or evidence of an ASTO installation, customer property or specific installed product. Do not present it as a completed job.
- Preserve desktop and mobile responsiveness, accessible controls, and sensible reduced-motion support.

## Codebase and development
- This is intentionally a simple, dependency-free static site. No framework, build step, database, or package manager is required.
- The website lives in `public/`, the only folder Cloudflare serves; keep internal docs like this file outside it.
- `public/index.html`: all page content and markup.
- `public/styles.css`: styling and responsive design.
- `public/config.js`: optional `contactEmail` only. Never put secrets in `public/`.
- `worker/index.js`: Cloudflare Worker for `/api/enquiry` (`run_worker_first: ["/api/*"]`); validates input, verifies Turnstile server-side, forwards to the Google Apps Script mailer (`docs/apps-script/`), which emails the fixed recipient admin@astosec.com with MailApp. Secrets (`FORM_ENABLED`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_SHARED_SECRET`) live only in Cloudflare (set by the owner in the dashboard); the form stays disabled unless `FORM_ENABLED` is `true` and all four other settings exist. Never log customer details. Setup: `docs/enquiry-form-setup.md`.
- Do not change Google Workspace DNS (MX, SPF, DKIM, DMARC), organisation-wide Google sharing settings, or enable Cloudflare Email Routing on astosec.com without the owner's approval.
- `public/script.js`: mobile menu, section reveal, dynamic copyright year, enquiry form (validation, honeypot, sending/success/error states).
- `public/privacy.html`, `public/404.html`, `public/robots.txt`: privacy notice, not-found page, crawler rules.
- `docs/`: launch checklist, enquiry workflow, business templates (never served; the GitHub repo is public, so never commit completed customer documents).
- Tests: `node tests/site.test.mjs` (Playwright), `node tests/worker.test.mjs`, `node tests/apps-script.test.mjs`. Tests must mock the enquiry API, Turnstile and Google and never send real enquiries.
- `public/assets/`: bundled optimised hero photo, plus logos and favicon in `public/assets/branding/`.
- `public/_headers`: security headers, plus `X-Robots-Tag: noindex` for the workers.dev and preview hostnames only (keep it; astosec.com pages carry no `noindex`, and never add it back to `/*` without the owner's approval); the Content-Security-Policy is report-only until the live-domain check in `docs/launch-checklist.md`.
- The public `/api/enquiry/config` response must stay `{enabled, turnstileSiteKey}` only: never expose setting names, statuses or values to visitors.
- `wrangler.jsonc` (repo root): Cloudflare Workers config for Worker `asto-website`, serving `./public`. Workers Builds preview builds fail without it, so keep it.
- Preview by opening `public/index.html`, or serve locally with `python -m http.server 8000 --directory public` and visit `http://localhost:8000`.
- Prefer small, targeted changes. Ask before introducing a framework, backend or paid third-party service.
- Keep the ASTO project completely separate from VERLONIQ, its repository, branding and deployment.

## Content, legal, and security guardrails
- Do not invent ABN, physical address, contact email/phone, licence numbers, customer reviews, case studies, awards, warranty claims or years of operation.
- Do not claim 24/7 monitoring, emergency response, or servicing of systems not actually confirmed.
- Queensland licensing and any employer conflict/outside-work obligations need owner review before publication.
- Never reuse employer/client photographs, site details, device lists, or confidential material without explicit permission.
- The contact form must **never** falsely confirm a submission. While the Worker reports it disabled it is clearly marked "not connected yet" and sends nothing; when enabled, success is shown only after Apps Script confirms the email was accepted.
- For a future live form, request the actual business email and chosen form platform, handle failures, validate data, and implement spam/privacy considerations. Never commit API secrets or credentials.
- Avoid Google indexing and public deployment until the owner explicitly approves launch. Do not push to GitHub, deploy Cloudflare, register a domain, send real emails, or modify any other project without clear approval.

## Good default workflow
1. Read this file, `README.md`, `public/index.html`, `public/styles.css`, and `public/script.js` before editing.
2. Show a brief plan or proposed changes.
3. Make focused edits to the existing files only.
4. Check navigation, mobile breakpoints, image paths, form disclaimer, and console errors.
5. Summarise which files changed, tests performed, and anything still needed before launch.
