# ASTO Security: public launch checklist

Work through these in order. Items marked **(owner)** need your accounts, decisions or business
details. None of them can be completed from the code. Nothing here changes DNS, Google Workspace
email records or Cloudflare secrets unless the step says so.

Current state:
- The enquiry form works in production: Worker, Turnstile and Apps Script, delivering to
  admin@astosec.com.
- Search indexing is still **blocked** by `X-Robots-Tag: noindex, nofollow` in `public/_headers`.

## 1. Business and operational readiness (owner)

- [ ] Business insurance in place (public liability, and professional indemnity if relevant).
- [ ] Business name, structure and ABN confirmed.
- [ ] Queensland security licensing confirmed for the work offered. Decide whether a licence number
      should appear on the website and documents.
- [ ] Employment contract and any outside-work or conflict-of-interest obligations checked.
- [ ] Business details added to the templates in `docs/business-templates/`.
- [ ] Enquiry routine ready: email filters and reply templates (`docs/enquiry-workflow.md`).

## 2. Confirm astosec.com works (owner)

- [ ] In Cloudflare → **Workers & Pages → asto-website → Settings → Domains & Routes**, check that
      `astosec.com` is attached as a custom domain. Add `www.astosec.com` too if you want it.
      Adding a custom domain creates its own DNS record; **don't change the existing Google
      Workspace MX, SPF, DKIM or DMARC records.**
- [ ] Choose **one** main address. The site's canonical tags, sitemap and sharing preview use
      `https://astosec.com/`. If you add `www`, redirect it to `https://astosec.com/` (Cloudflare →
      Rules → Redirect Rules).
- [ ] Open `https://astosec.com/` and check the padlock (HTTPS), the homepage, `/privacy`, and that
      a made-up address (e.g. `/test`) shows the "Page not found" page.
- [ ] Optional: in Cloudflare → SSL/TLS, turn on **Always Use HTTPS**. Consider **HSTS** once
      you're sure HTTPS works on every hostname you use.

## 3. Turnstile authorises the public domain (owner)

- [ ] Cloudflare → **Turnstile → ASTO website → Hostnames**: add `astosec.com`, plus
      `www.astosec.com` if it serves the site rather than redirecting. Keep the workers.dev
      hostname for now.
- [ ] Don't change the Turnstile keys or the Worker's secrets.

## 4. Enquiry form works on the public domain (owner)

- [ ] On `https://astosec.com/`, send one enquiry per service (CCTV, intruder alarms,
      preventative maintenance) using a personal email address.
- [ ] Check each arrives in admin@astosec.com from "ASTO Security website", with the subject
      `New ASTO enquiry: <service> – <suburb>`, and that **Reply** goes to the customer.
- [ ] Open the browser's developer console (F12 → Console) during the test. If there are **no
      Content-Security-Policy warnings**, ask Claude to switch the CSP from report-only to enforced
      (a one-line change in `public/_headers`).
- [ ] `https://astosec.com/api/enquiry/config` should show only
      `{"enabled":true,"turnstileSiteKey":"…"}`. The site key is public by design.

## 5. Privacy notice and contact details (owner)

- [ ] Read `/privacy`. It describes the enquiry form, Cloudflare (hosting and Turnstile), Google
      Workspace email and Google Fonts. Update it if you add analytics, a mailing list or another
      service.
- [ ] Decide whether to show a contact email or phone number. To show an email, set `contactEmail`
      in `public/config.js`, e.g. `'admin@astosec.com'`. Use only confirmed details.

## 6. Sitemap (ready)

- [x] `public/sitemap.xml` lists `https://astosec.com/` and `https://astosec.com/privacy`, and
      `public/robots.txt` points to it.
- [ ] After the domain works, open `https://astosec.com/sitemap.xml` to confirm it loads.

## 7. Remove `noindex`: only with explicit owner approval

- [ ] When you approve public indexing, ask Claude to remove **only** the `X-Robots-Tag: noindex,
      nofollow` line from `public/_headers` (via a pull request). Leave the other security headers.
- [ ] After it deploys, check `https://astosec.com/` in a header checker, or the browser's
      developer tools (Network → the page → Response Headers), and confirm `x-robots-tag` is gone.

## 8. Google Search Console (owner, free)

- [ ] Add the property `https://astosec.com/`. Domain verification uses a DNS TXT record; the
      HTML-tag method avoids a DNS change. Ask before adding DNS records.
- [ ] Submit `https://astosec.com/sitemap.xml`.
- [ ] Use **URL Inspection** on the homepage to request indexing.

## 9. Google Business Profile (owner, free)

- [ ] Create the profile with genuine details only: business name, category (e.g. "Security system
      installer"), service area (Brisbane suburbs you cover) and website `https://astosec.com/`.
- [ ] If you have no shopfront, set it up as a service-area business with your address hidden.
- [ ] No invented reviews, photos of other people's work or unverified claims.

## 10. Final customer enquiry test (owner)

- [ ] After indexing is approved and live, send one final enquiry from a phone on mobile data.
- [ ] Reply to it from admin@astosec.com and confirm the reply reaches the "customer" address.
- [ ] Delete the test enquiries, and record the launch date.

## Keep in mind

- **Turning the form off:** set `FORM_ENABLED` to anything other than `true` (Cloudflare →
  asto-website → Settings → Variables and secrets) and deploy. Its secrets and settings survive
  GitHub deployments (`keep_vars: true`).
- **Production deploys** run automatically when a pull request is merged into `main`.
- **The GitHub repository is public.** Never commit completed customer documents or secrets.
