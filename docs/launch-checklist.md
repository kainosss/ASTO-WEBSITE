# ASTO Security: launch checklist

Everything below needs you (accounts, decisions or details only you can supply). Nothing here has
been created or invented for you.

## A. Make the enquiry form live (Formspree)

1. **Create ASTO's own Formspree account** with the ASTO business email address. Keep it separate
   from any other business. Do not reuse another business's form.
2. **Create a new form**, e.g. "ASTO website enquiries", set to deliver to the ASTO inbox, and
   confirm the verification email Formspree sends.
3. **Copy the form's endpoint** (it looks like `https://formspree.io/f/xxxxxxxx`) into
   `public/config.js` → `formEndpoint`. Optionally set `contactEmail` to show your address beside the
   form. A form endpoint is not a secret, but never put passwords or API keys in that file.
4. **Spam settings:** the website already uses a hidden "honeypot" field (`_gotcha`) and a short
   timing check. The form sends with JavaScript (AJAX). If test submissions fail with a CAPTCHA or
   reCAPTCHA error, turn reCAPTCHA off in that form's Formspree settings. If your plan lets you
   restrict submissions to your own domain, add the live domain once you have it.
5. **Check the plan limits.** Formspree's free plan has a monthly submission limit. Check the
   current pricing and decide whether you need to upgrade. That is a cost decision for you.
6. **Test from the Cloudflare preview link**, using your own details. Check that:
   - the button shows "Sending…", then the green "Your enquiry has been sent" message;
   - the email arrives with the subject `New ASTO enquiry: <service> – <suburb>` and all fields;
   - replying goes to the address you entered;
   - submitting with no internet connection shows the red error, and your details stay in the form.

   Then delete the test submissions in Formspree.
7. Set up the email filters in `docs/enquiry-workflow.md`.

## B. Business details (owner review before launch)

- [ ] Confirm the final business name and structure, and your ABN.
- [ ] Confirm Queensland security licensing for the work offered, and whether a licence number
      should appear on the website and documents.
- [ ] Check your employment contract and any outside-work or conflict-of-interest obligations.
- [ ] Decide whether to publish a phone number and/or email (`contactEmail` in `public/config.js`).
- [ ] Review the privacy notice (`public/privacy.html`). It describes how the form, Formspree,
      Cloudflare and Google Fonts are used. Update it if you add analytics, a different form
      service or a mailing list.
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
5. Test HTTPS, the form (one real test enquiry) and the sharing preview (paste the URL into a
   messaging app).
6. Optional and free: create a Google Business Profile for local search in Brisbane. Use only
   genuine details, and decide how to show your service area if you have no shopfront.
7. Optional: a free Google Search Console account to submit the sitemap.

## D. Keep in mind

- Workers Builds deploys production automatically when changes are merged into `main`. Turn that
  off in the Worker's build settings if you want merges to stay unpublished until launch.
- The `*.workers.dev` preview and production addresses are public to anyone with the link. The
  noindex header keeps them out of search results, but it is not a password.
