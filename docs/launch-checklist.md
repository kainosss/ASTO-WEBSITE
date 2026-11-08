# ASTO Security: public launch checklist

Work through these in order. Items marked **(owner)** need your accounts, decisions or business
details. None of them can be completed from the code. Nothing here changes DNS, Google Workspace
email records or Cloudflare secrets unless the step says so.

Current state (checked 8 November 2026, after PR #9):
- `main` includes the security hardening (PR #7), the hero camera retouch and the hard-wired CCTV
  comparison (PRs #8 and #9).
- `https://astosec.com` is public (Cloudflare Access removed). ASTO Office stays private at
  `office.astosec.com`. The enquiry form is enabled.
- Search indexing is still blocked by `X-Robots-Tag: noindex, nofollow` until the "enable indexing"
  change is merged. The workers.dev address is also public now; it keeps `noindex` permanently.
- `www.astosec.com` has no DNS record. `astosec.com.au` is on Cloudflare but doesn't redirect yet
  (Cloudflare error 522), and `www.astosec.com.au` points to `192.0.2.1` without the proxy.
- A `google-site-verification` TXT record already exists on `astosec.com`.

## 1. Business and operational readiness (owner)

- [ ] Business insurance in place (public liability, and professional indemnity if relevant).
- [ ] Business name, structure and ABN confirmed. Decide whether to show the ABN in the footer.
- [ ] Queensland security licensing confirmed for the work offered. Check with the Office of Fair
      Trading whether your licence number must appear on the website and in advertising. Supply it
      if so.
- [ ] Employment contract and any outside-work or conflict-of-interest obligations checked.
- [ ] Business details added to the templates in `docs/business-templates/`.
- [ ] Enquiry routine ready: email filters and reply templates (`docs/enquiry-workflow.md`).

## 2. Public access (done)

- [x] Cloudflare Access removed from `astosec.com`; ASTO Office remains protected on
      `office.astosec.com`. Keep it that way when editing Access applications.
- [x] `https://astosec.com/`, `/privacy`, `/robots.txt` and `/sitemap.xml` load publicly, and
      `/api/enquiry/config` shows only `{"enabled":true,"turnstileSiteKey":"…"}`.

## 3. Domains (owner, DNS changes need your approval)

- [ ] **`www.astosec.com`** (recommended, so people who type `www` still arrive): add a proxied
      (orange-cloud) DNS record for `www`, e.g. `AAAA www 100::`, then **Rules → Redirect Rules**:
      hostname `www.astosec.com` → `https://astosec.com${path}` (301, keep query string). Don't
      touch the MX, SPF, DKIM or DMARC records.
- [ ] **`astosec.com.au`** → `astosec.com`: in the `astosec.com.au` zone, make the apex and `www`
      records **proxied** (orange cloud). `www` currently points to `192.0.2.1` and isn't
      proxied. Then add a Redirect Rule: all requests → `https://astosec.com${path}` (301, keep
      query string). Test both `https://astosec.com.au/` and `https://www.astosec.com.au/`.
- [ ] Optional: SSL/TLS → **Always Use HTTPS** on both zones. Consider HSTS once you're sure HTTPS
      works on every hostname you use.
- [ ] Optional email improvement: `astosec.com` has no DMARC record. Ask before adding one (start
      with `p=none`).

## 4. Turnstile authorises the public domain (owner)

- [ ] Cloudflare → **Turnstile → ASTO website → Hostnames**: `astosec.com` must be listed. Keep the
      workers.dev hostname. You don't need to add `www` or `.com.au`: they redirect.
- [ ] Don't change the Turnstile keys or the Worker's secrets.

## 5. One controlled live enquiry test (owner)

- [ ] In a private window on `https://astosec.com/`, send **one** enquiry with fictional details:
      name "Launch Test", your personal email, suburb "Brisbane", service "CCTV installation",
      message "Website launch test, please ignore."
- [ ] Check it arrives in admin@astosec.com from "ASTO Security website", with the subject
      `New ASTO enquiry: CCTV installation – Brisbane`, and that **Reply** goes to your personal
      address.
- [ ] Keep the browser console open (F12 → Console). If there are **no Content-Security-Policy
      warnings**, ask Claude to switch the CSP from report-only to enforced (one line in
      `public/_headers`).

## 6. Allow indexing: only with your explicit approval

- [ ] Merge the "enable indexing" change. It removes `X-Robots-Tag: noindex, nofollow` for
      astosec.com only; workers.dev, preview URLs and `/api` stay `noindex`.
- [ ] After it deploys, check `https://astosec.com/` in the browser's developer tools (Network → the
      page → Response Headers): `x-robots-tag` should be gone.

## 7. Google Search Console (owner, free)

- [ ] Go to <https://search.google.com/search-console>. A `google-site-verification` TXT record
      already exists on `astosec.com`, so a **Domain** property for `astosec.com` may already be
      verified. If not, add the property and use the TXT value Google shows (ask before changing
      DNS).
- [ ] **Sitemaps** → submit `https://astosec.com/sitemap.xml`. It should say "Success".
- [ ] **URL Inspection** → `https://astosec.com/` → **Test live URL**, then **Request indexing**.
      Do the same for `https://astosec.com/privacy`.
- [ ] Over the next 1–4 weeks, check **Pages** (indexing) and **Performance** (searches). It is
      normal for new sites to take time to appear.

## 8. Google Business Profile (owner, free)

- [ ] Website field: exactly `https://astosec.com/`.
- [ ] Business name "ASTO Security", the same email (admin@astosec.com) and the same service area
      (Brisbane) as the website. Add a phone number only once you have a confirmed business number,
      and then add it to the website too.
- [ ] Categories, for example "Security system installer" (primary). Add services: CCTV
      installation, intruder alarm installation, security system maintenance.
- [ ] Service-area business with the address hidden if you have no shopfront.
- [ ] No invented reviews, photos of other people's work or unverified claims. Ask genuine
      customers for reviews after completed jobs.

## 9. Final checks after launch (owner)

- [ ] From a phone on mobile data: open the site, tap **Get a Free CCTV Quote**, and check that it
      jumps to the form.
- [ ] Reply to the launch-test enquiry from admin@astosec.com and confirm the reply arrives.
- [ ] Delete the test enquiry and record the launch date.

## Keep in mind

- **Turning the form off:** set `FORM_ENABLED` to anything other than `true` (Cloudflare →
  asto-website → Settings → Variables and secrets) and deploy. Its secrets and settings survive
  GitHub deployments (`keep_vars: true`).
- **Production deploys** run automatically when a pull request is merged into `main`.
- **The GitHub repository is public.** Never commit completed customer documents or secrets.
