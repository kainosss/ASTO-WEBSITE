# ASTO Security: enquiry form setup (Cloudflare Worker + Turnstile + Google Apps Script)

How the form works:

```
Visitor's browser ──POST /api/enquiry──▶ Cloudflare Worker (asto-website)
  (form + Turnstile)                      • checks origin, size, honeypot, timing
                                          • validates every field
                                          • verifies Turnstile with Cloudflare (server-side)
                                          ──POST + shared secret──▶ Google Apps Script web app
                                                                     • checks the shared secret
                                                                     • validates again, 50/day cap
                                                                     • MailApp → admin@astosec.com
                                                                       (fixed recipient; customer = Reply-To)
```

The visitor sees "Your enquiry has been sent" **only** after Apps Script confirms that MailApp
accepted the email.

**The form is off until you switch it on.** The Worker reports the form as enabled only when
`FORM_ENABLED` is exactly `true` **and** the four other settings are present. Until then the site
shows "Website preview: this form is not connected yet" and accepts nothing, so it is safe to merge
and deploy the Worker before adding any settings. Search indexing stays off throughout
(`public/_headers` sends `noindex`). Nothing here changes Google Workspace DNS (MX, SPF, DKIM,
DMARC) or Google sharing settings.

Overview: Part 1–3 prepare the accounts → Part 4 merge and check (form still off) → Part 5 add the
credentials in the Cloudflare dashboard → Part 6 switch on and test → Part 7 switching off, rollback
and the public launch.

Never paste secrets into chat, GitHub, email or this repository. Turn on two-factor authentication
for both the Google Workspace and Cloudflare accounts.

---

## Part 1: Create the shared secret

1. In your password manager, generate a random password of **at least 40 characters**, using only
   letters and numbers (this avoids copy-paste problems).
2. Save it as **"ASTO enquiry form: shared secret"**. You will paste it into Google (Part 2) and
   Cloudflare (Part 4).

## Part 2: Create and deploy the Google Apps Script

Do all of this while signed in as **admin@astosec.com**.

1. Go to <https://script.google.com> → **New project**. Rename it (top left) to
   **ASTO website enquiry mailer**.
2. Select the **gear icon (Project Settings)** → tick **Show "appsscript.json" manifest file in
   editor**.
3. Back in the **Editor**:
   - Open `Code.gs`, delete its contents and paste in the whole of `docs/apps-script/Code.gs` from
     this repository.
   - Open `appsscript.json`, delete its contents and paste in `docs/apps-script/appsscript.json`.
   - Select **Save** (disk icon).
4. **Project Settings → Script Properties → Add script property**:
   - Property: `SHARED_SECRET`
   - Value: the shared secret from Part 1

   Select **Save script properties**.
5. **Grant the email permission and test delivery:** in the Editor, choose the function
   **`sendTestEmail`** in the toolbar, then select **Run** → **Review permissions** → choose
   admin@astosec.com. The only permission requested should be **"Send email as you"**. Allow it.
   Check that the test email "ASTO enquiry mailer: test" arrives in the admin@astosec.com inbox.
6. **Deploy as a web app:** **Deploy → New deployment** → select the gear next to "Select type" →
   **Web app**:
   - Description: `ASTO enquiry mailer v1`
   - Execute as: **Me (admin@astosec.com)**
   - Who has access: **Anyone**

   Select **Deploy**, then copy the **Web app URL**. It starts with
   `https://script.google.com/macros/s/` and ends with `/exec`. Keep it private.
   - **If "Anyone" is not offered:** your Workspace sharing policy blocks it. Do not change the
     organisation-wide setting. Tell me, and we'll choose a narrowly scoped alternative (for
     example, an exception for an organisational unit containing only admin@astosec.com).
7. **Updating the script later:** use **Deploy → Manage deployments → ✏️ Edit → Version: New version
   → Deploy**. This keeps the same URL.

## Part 3: Create the Cloudflare Turnstile widget

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Settings:
   - Widget name: **ASTO website**
   - Hostnames: add your **production workers.dev hostname**. You'll find it in the Cloudflare
     dashboard under **Workers & Pages → asto-website → Settings → Domains & Routes**; it is likely
     `asto-website.kainerpersonal.workers.dev`. Add `astosec.com` and `www.astosec.com` later, when
     the domain is connected.
   - Widget mode: **Managed**
   - Pre-clearance: **No**
3. **Create**, then copy the **Site key** (public) and the **Secret key** (private).

## Part 4: Merge PR #5 and check the form is still off

1. On GitHub, open the ASTO pull request and select **Merge** (only once you have approved it).
   Workers Builds deploys the website and the Worker script to production, usually within a
   minute or two. You can watch it under **asto-website → Deployments**.
2. Open `https://<your production hostname>/api/enquiry/config` in your browser. It should show:

   ```
   {"enabled":false,"turnstileSiteKey":""}
   ```

   - If you see the **"Page not found"** page instead, the Worker script didn't deploy. Stop here
     and tell Claude. The form stays safely off either way.
3. Open the homepage. It should look the same as before, and the form should say **"Website
   preview: this form is not connected yet"**.

## Part 5: Add the credentials in the Cloudflare dashboard (form still off)

1. Cloudflare dashboard → **Workers & Pages** → **asto-website** → **Settings** →
   **Variables and secrets**. Make sure the toggle shows **Production**.
   - Now that the Worker has a script, the message "Variables cannot be added to a Worker that only
     has static assets" should no longer appear.
2. Select **+ Add** and add these four, each with **Type: Secret**:

   | Name | Value |
   |---|---|
   | `TURNSTILE_SITE_KEY` | Turnstile site key (Part 3) |
   | `TURNSTILE_SECRET_KEY` | Turnstile secret key (Part 3) |
   | `APPS_SCRIPT_URL` | Apps Script web app URL ending in `/exec` (Part 2) |
   | `APPS_SCRIPT_SHARED_SECRET` | the shared secret (Part 1) |

   Type each name exactly as shown (capitals and underscores).
3. Select **Deploy** (or **Save and deploy**). The form is **still off**, because `FORM_ENABLED`
   isn't set yet.

Settings saved in the dashboard stay in place when future GitHub changes are deployed:
`wrangler.jsonc` has `keep_vars: true`, and secrets are never removed by deploys.

## Part 6: Switch the form on and test a genuine enquiry

1. In the same **Variables and secrets** list, select **+ Add**: name `FORM_ENABLED`, **Type: Secret**,
   value `true`. Select **Deploy**.
2. Open the website on your production hostname and refresh the page. The grey "Website preview:
   this form is not connected…" line under the button should be gone.
3. Fill in the form as a customer would. Use a **personal** email address (not admin@astosec.com),
   choose **CCTV installation**, and wait at least 3 seconds. Then select **Send enquiry**.
4. Expect **"Sending…"**, then the green **"Thank you. Your enquiry has been sent…"** message.
5. In the admin@astosec.com inbox, check that:
   - it comes from **ASTO Security website &lt;admin@astosec.com&gt;**;
   - the subject is **New ASTO enquiry: CCTV installation – &lt;suburb&gt;**;
   - every field is correct, and "Phone: Not supplied" appears if you left phone blank;
   - **Reply** addresses the personal email you entered.
6. Repeat with **Intruder alarms** and **Preventative maintenance**, and check that your email
   filters sort them (see `docs/enquiry-workflow.md`).
7. **Failure test:** in Apps Script → Project Settings, temporarily change `SHARED_SECRET` to
   anything else. Submit again. You should see the red **"could not be sent"** message, your
   details should stay in the form, and **no email** should arrive. Then **put the real secret
   back**.
8. **Privacy check:** Apps Script → **Executions** should show runs, but no names, emails or
   messages.
9. If anything fails, tell Claude the **error message shown on the page** (never the secrets).

**If the form stays off after adding all five settings:** open Cloudflare → **asto-website** →
**Observability / Workers Logs**, and reload the website once. A log line
`enquiry_form_disabled: …` names the settings that need attention (names only, never values). The
public `/api/enquiry/config` response only says `{"enabled":false,…}` and never names settings.
The Worker accepts both Apps Script URL formats (`…/macros/s/…/exec` and
`…/a/macros/astosec.com/s/…/exec`), ignores spaces or line breaks pasted around values, and
accepts `true` in any capitalisation.

While the form is on, anyone with the website's address can send an enquiry. Search engines won't
list the site while `noindex` is on. If you're not ready for real customers, switch the form off
(below) until you are.

## Part 7: Switching off, rolling back and launching

**Turning the form off at any time:** in **Variables and secrets** (Production), delete
`FORM_ENABLED` (or set it to anything other than `true`) and select **Deploy**. The form returns to
the "not connected" state straight away and accepts nothing. The other four settings can stay.

**Rolling back the whole change:** on GitHub, open the merged pull request → **Revert** → merge the
revert pull request. Production redeploys the previous version. Alternatively, **asto-website →
Deployments** lets you roll back to an earlier version.

**At the public launch:** follow `docs/launch-checklist.md`. It covers the domain, Turnstile
hostnames, a live enquiry test, the sitemap and, only with your approval, removing `noindex`.

**If a secret may have leaked:**
- Shared secret: generate a new one, then update it in both Apps Script (Script Properties) and
  Cloudflare.
- Turnstile secret key: rotate it in the Turnstile widget settings, then update it in Cloudflare.
