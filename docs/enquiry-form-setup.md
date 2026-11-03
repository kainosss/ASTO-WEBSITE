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
accepted the email. Production stays **disabled** until you add its secrets after an approved launch.

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
   - Hostnames: add `claude-dazzling-meitner-k2g3cu-asto-website.kainerpersonal.workers.dev`
     (the preview). Add `astosec.com` and `www.astosec.com` later, at launch.
   - Widget mode: **Managed**
   - Pre-clearance: **No**
3. **Create**, then copy the **Site key** (public) and the **Secret key** (private).

## Part 4: Add the secrets to the PREVIEW only (never production)

Previews and production have **separate** secrets in Cloudflare. Add these **only to the preview
for this branch** (`claude-dazzling-meitner-k2g3cu`).

| Name | Value |
|---|---|
| `FORM_ENABLED` | `true` |
| `TURNSTILE_SITE_KEY` | Turnstile site key (Part 3) |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key (Part 3) |
| `APPS_SCRIPT_URL` | Apps Script web app URL ending in `/exec` (Part 2) |
| `APPS_SCRIPT_SHARED_SECRET` | the shared secret (Part 1) |

**Recommended: from your own computer with Wrangler** (needs Node.js 18 or later). Run each
command, then paste the value when Wrangler asks. The value isn't shown on screen or saved in your
shell history.

```bash
npx wrangler login
```

```bash
npx wrangler preview secret put FORM_ENABLED --worker-name asto-website --name claude-dazzling-meitner-k2g3cu
```

Repeat the same command for `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `APPS_SCRIPT_URL` and
`APPS_SCRIPT_SHARED_SECRET`. Each command creates a new preview deployment with the secret added.

Check that all five names are listed for the preview:

```bash
npx wrangler preview secret list --worker-name asto-website --name claude-dazzling-meitner-k2g3cu
```

**Do not** run `npx wrangler secret put …` (without `preview`). That sets production secrets.

**Alternative: the dashboard.** Add the same five as **encrypted secrets** in the asto-website
Worker's **Preview** settings. Do not add them to the Worker's main "Variables and Secrets" list,
which is production.

## Part 5: Test a genuine enquiry end to end (preview only)

1. Open the preview at
   `https://claude-dazzling-meitner-k2g3cu-asto-website.kainerpersonal.workers.dev` and refresh the
   page.
   - The grey "Website preview: this form is not connected…" line under the button should be gone.
   - Use this branch address, **not** the commit-specific `xxxxxxxx-asto-website…` address. Turnstile
     only allows the hostnames you listed.
2. Fill in the form as a customer would. Use a **personal** email address (not admin@astosec.com),
   choose **CCTV installation**, and wait at least 3 seconds. Then select **Send enquiry**.
3. Expect **"Sending…"**, then the green **"Thank you. Your enquiry has been sent…"** message.
4. In the admin@astosec.com inbox, check that:
   - it comes from **ASTO Security website &lt;admin@astosec.com&gt;**;
   - the subject is **New ASTO enquiry: CCTV installation – &lt;suburb&gt;**;
   - every field is correct, and "Phone: Not supplied" appears if you left phone blank;
   - **Reply** addresses the personal email you entered.
5. Repeat with **Intruder alarms** and **Preventative maintenance**, and check that your email
   filters sort them (see `docs/enquiry-workflow.md`).
6. **Failure test:** in Apps Script → Project Settings, temporarily change `SHARED_SECRET` to
   anything else. Submit again. You should see the red **"could not be sent"** message, your
   details should stay in the form, and **no email** should arrive. Then **put the real secret
   back**.
7. **Privacy check:** Apps Script → **Executions** should show runs, but no names, emails or
   messages.
8. **Production is still off:** open
   `https://asto-website.kainerpersonal.workers.dev/api/enquiry/config` (your production
   workers.dev address). It should show `{"enabled":false,…}`.
9. Tell me the results. If anything fails, send me the **error message shown on the page** (never
   the secrets).

## Part 6: At the approved launch (not before)

1. Add `astosec.com` (and `www.astosec.com` if used) to the Turnstile widget's hostnames.
2. Add the same five secrets to **production**:

   ```bash
   npx wrangler secret put FORM_ENABLED --name asto-website
   ```

   Repeat for the other four.
3. Send one real test enquiry on the live domain.

**Turning the form off at any time:** delete `FORM_ENABLED` (or set it to anything other than
`true`). The form immediately returns to the "not connected" state and accepts nothing.

**If a secret may have leaked:**
- Shared secret: generate a new one, then update it in both Apps Script (Script Properties) and
  Cloudflare.
- Turnstile secret key: rotate it in the Turnstile widget settings, then update it in Cloudflare.
