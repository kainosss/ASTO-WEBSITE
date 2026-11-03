# ASTO Security: launch checklist

Everything below needs you (accounts, decisions or details only you can supply). Nothing here has
been created or invented for you.

## A. Make the enquiry form live (Cloudflare Worker + Google Apps Script)

Follow **`docs/enquiry-form-setup.md`** step by step. In short:

1. Create a strong shared secret in your password manager.
2. Create and deploy the Google Apps Script as admin@astosec.com (web app; Execute as: Me; Who has
   access: Anyone), and store the shared secret in its Script Properties.
3. Create a Cloudflare Turnstile widget for the preview hostname.
4. Add the five secrets to the **preview only** (`FORM_ENABLED`, `TURNSTILE_SITE_KEY`,
   `TURNSTILE_SECRET_KEY`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_SHARED_SECRET`).
5. Test genuine enquiries end to end on the preview, including a failure test.
6. Production stays disabled (no secrets) until you approve launch.

No DNS records and no organisation-wide Google sharing settings are changed. There is no extra
subscription: Cloudflare Workers Free, Turnstile and Apps Script (included in Google Workspace).

## B. Business details (owner review before launch)

- [ ] Confirm the final business name and structure, and your ABN.
- [ ] Confirm Queensland security licensing for the work offered, and whether a licence number
      should appear on the website and documents.
- [ ] Check your employment contract and any outside-work or conflict-of-interest obligations.
- [ ] Decide whether to publish a phone number and/or email (`contactEmail` in `public/config.js`).
- [ ] Review the privacy notice (`public/privacy.html`). It describes how the form, Cloudflare
      (hosting and Turnstile), Google Workspace and Google Fonts are used. Update it if you add
      analytics, a different form service or a mailing list.
- [ ] Add your business details to the templates in `docs/business-templates/`.
- [ ] Consider making the GitHub repository **private**. It is currently public, so anyone can read
      the website code, docs and templates (no secrets or customer data are stored in it).

## C. Domain and launch (only when you approve)

1. Register or choose the domain, then add it to the `asto-website` Worker in Cloudflare
   (Workers → asto-website → Settings → Domains & Routes).
2. Replace `YOUR-DOMAIN` in `docs/launch/sitemap.template.xml`, save it as `public/sitemap.xml`,
   and uncomment the `Sitemap:` line in `public/robots.txt`.
3. In `public/index.html`, change `og:image` to the full address
   (`https://YOUR-DOMAIN/assets/og-image.jpg`), and add
   `<link rel="canonical" href="https://YOUR-DOMAIN/">` and
   `<meta property="og:url" content="https://YOUR-DOMAIN/">`.
4. **Enable search indexing:** remove the `X-Robots-Tag: noindex, nofollow` rule from
   `public/_headers`. Do this only at the approved launch.
5. Add the five secrets to production and `astosec.com` to the Turnstile hostnames
   (`docs/enquiry-form-setup.md`, Part 6), then test HTTPS, the form (one real test enquiry) and the
   sharing preview (paste the URL into a messaging app).
6. Optional and free: create a Google Business Profile for local search in Brisbane. Use only
   genuine details, and decide how to show your service area if you have no shopfront.
7. Optional: a free Google Search Console account to submit the sitemap.

## D. Keep in mind

- Workers Builds deploys production automatically when changes are merged into `main`. Turn that
  off in the Worker's build settings if you want merges to stay unpublished until launch.
- The `*.workers.dev` preview and production addresses are public to anyone with the link. The
  noindex header keeps them out of search results, but it is not a password.
