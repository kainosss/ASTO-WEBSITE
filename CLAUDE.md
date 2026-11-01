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
- Hero is a synthetic illustrative image in `assets/asto-home-hero.webp`, **not** evidence of an ASTO installation. Do not present it as a completed job.
- Preserve desktop and mobile responsiveness, accessible controls, and sensible reduced-motion support.

## Codebase and development
- This is intentionally a simple, dependency-free static site. No framework, build step, database, or package manager is required.
- `index.html`: all page content and markup.
- `styles.css`: styling and responsive design.
- `script.js`: mobile menu, section reveal, dynamic copyright year, form demo behaviour.
- `assets/`: bundled optimised hero photo and SVG favicon.
- Preview by opening `index.html`, or serve locally with `python -m http.server 8000` and visit `http://localhost:8000`.
- Prefer small, targeted changes. Ask before introducing a framework, backend or paid third-party service.
- Keep the ASTO project completely separate from VERLONIQ, its repository, branding and deployment.

## Content, legal, and security guardrails
- Do not invent ABN, physical address, contact email/phone, licence numbers, customer reviews, case studies, awards, warranty claims or years of operation.
- Do not claim 24/7 monitoring, emergency response, or servicing of systems not actually confirmed.
- Queensland licensing and any employer conflict/outside-work obligations need owner review before publication.
- Never reuse employer/client photographs, site details, device lists, or confidential material without explicit permission.
- The current contact form is demo-only and must **never** falsely confirm a submission. It presently does not send/store enquiries.
- For a future live form, request the actual business email and chosen form platform, handle failures, validate data, and implement spam/privacy considerations. Never commit API secrets or credentials.
- Avoid Google indexing and public deployment until the owner explicitly approves launch. Do not push to GitHub, deploy Cloudflare, register a domain, send real emails, or modify any other project without clear approval.

## Good default workflow
1. Read this file, `README.md`, `index.html`, `styles.css`, and `script.js` before editing.
2. Show a brief plan or proposed changes.
3. Make focused edits to the existing files only.
4. Check navigation, mobile breakpoints, image paths, form disclaimer, and console errors.
5. Summarise which files changed, tests performed, and anything still needed before launch.
