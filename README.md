# ASTO Security — Website Redesign (Concept)

Responsive, one-page, original static website designed for **Brisbane residential and small-commercial security**. Services: CCTV, intruder alarms, preventative maintenance.

## How to preview

Open `public/index.html` in a browser, or run `python3 -m http.server 8000 --directory public` and visit `http://localhost:8000`. Keep everything inside `public/` together. The hero photograph is a locally bundled optimized WebP file; it doesn't need an internet connection. Online Google Fonts are optional; system fonts are used as a fallback.

## Before publishing

1. Update business contact information and confirmed company/ABN details. Set `SITE_CONFIG.contactEmail` in `public/script.js` if you'd like to enable a **mailto draft** (still requires the visitor to send from their email app). For a truly working contact form, connect a real form backend such as Formspree or Cloudflare Workers with spam protection. **The contact form is intentionally inactive in the demo and never falsely reports a successful submission.**
2. Verify and publish only the applicable Queensland security licensing and business details. Security equipment installation/servicing generally requires an individual security equipment installer licence; the requirements for a separate firm licence depend on the business structure (the Queensland Government describes a sole-trader exemption for a person who performs all the security work personally). Review current rules before trading.
3. Check your employment contract and any outside-work/conflict requirements before public marketing or accepting work. Do not use photos or client references from an employer without permission.
4. Check the final business name and domain, then connect a proper mailbox. Confirm privacy and data-handling requirements when deploying a form.
5. Replace the demonstration photo with a permissioned project photograph if desired. The included scene is a **synthetic illustrative image**, not an ASTO completed installation. Do not caption it as a completed job.
6. Review the claims and services for accuracy before publication. No invented testimonials, emergency response, monitoring or licensing claims have been added.

## Files

Everything in `public/` is the website and is the only folder Cloudflare serves. Repository files such as this README and `CLAUDE.md` are never published.

- `public/index.html`: layout, content, navigation
- `public/styles.css`: appearance, responsive breakpoints, accessibility
- `public/script.js`: mobile navigation, scroll effects, year, enquiry draft
- `public/_headers`: pre-launch `noindex` header for all pages (remove only at approved launch)
- `public/assets/asto-home-hero-v3.webp`: AI-generated illustrative hero background (photograph-style, no baked-in text); not genuine on-site photography, a customer site or an ASTO installation
- `public/assets/branding/`: proposed Concept 1 vector logos (geometric A, forest green and sage); `asto-favicon-tab.svg` (geometric A on a forest-green rounded square, tuned for 16–32px tabs) is the site favicon; the header and footer use the inlined `asto-horizontal-dark.svg` and `asto-horizontal-light.svg`
- `wrangler.jsonc`: Cloudflare Workers config (Worker `asto-website`, serves `./public`); required for pull-request preview builds

## Inspiration / research

The visual approach drew on contemporary security sites and redesign case studies for their clear service architecture and conversion paths, not their copyrighted designs or images. Helpful references:
- [Eversafe Security website design case study](https://www.scorchedmedia.com.au/portfolio-items/eversafe-security/)
- [Eveready Alarms redesign case study](https://lmtdev.com.au/eveready-alarms/)
- [Sectacom website design case study](https://uniwebau.com/website-portfolio/sectacom/)

Queensland licensing information: [Security equipment installer licence](https://www.qld.gov.au/community/fair-trading/regulated-industries-licensing-and-legislation/security-industry-regulation/security-technical-licence/apply-for-a-security-equipment-installer-licence) and [Security firm licence](https://www.qld.gov.au/community/fair-trading/regulated-industries-licensing-and-legislation/security-industry-regulation/managing-a-security-firm/apply-for-a-security-firm-licence).
