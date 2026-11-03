# ASTO Security: customer enquiry workflow

A simple process for handling website enquiries around a full-time job. No booking software, no
promised response times.

## 1. What the customer does

1. Visits the website and selects **Get in touch**, **Request an enquiry** or a service link.
2. Chooses a **service**: CCTV installation, Intruder alarms, Preventative maintenance or General
   enquiry. They also give their property type and suburb.
3. Enters their name, email, optional phone and a short description of the job, then selects
   **Send enquiry**.
4. Sees the on-screen confirmation *"Thank you. Your enquiry has been sent…"*. It appears **only**
   after Formspree confirms that it accepted the enquiry. If sending fails, they see an error, and
   their details stay in the form so they can try again.

The website does not send the customer a confirmation email. Formspree can do this on some paid
plans. If you add it later, keep the wording free of response-time promises.

## 2. What you receive

Each enquiry arrives as an email from Formspree in the ASTO inbox you registered with Formspree.

- **Subject:** `New ASTO enquiry: <service> – <suburb>`, for example
  `New ASTO enquiry: CCTV installation – Carindale`.
- **Fields, in this order:** service, name, email, phone ("Not supplied" if left blank), suburb,
  property type and message.
- **Reply:** Formspree normally sets the reply-to address to the customer's email, so you can answer
  directly. Check this with your first test enquiry.

This gives you enough to make first contact and prepare a quote: who the customer is, how to reach
them, where they are, what kind of property it is and what they want done.

## 3. Sort enquiries automatically (email filters)

Create a filter in Gmail or Outlook for each service, matching on the subject:

| Subject contains | Apply label / move to folder |
|---|---|
| `New ASTO enquiry: CCTV installation` | ASTO / CCTV |
| `New ASTO enquiry: Intruder alarms` | ASTO / Alarms |
| `New ASTO enquiry: Preventative maintenance` | ASTO / Maintenance |
| `New ASTO enquiry: General enquiry` | ASTO / General |

Optional: also star or flag them, or turn on phone notifications for that label only.

## 4. Suggested routine

- **Once a day (for example, in the evening):** open new enquiries and send each one a short
  acknowledgement (template A below). Ask for photos where they would help you quote.
- **When you have the information:** prepare the quote with
  `docs/business-templates/installation-quote.html` and send it as a PDF.
- **Log each enquiry** in a simple spreadsheet. Suggested columns: Date received · Name · Suburb ·
  Service · Property type · Status (New / Replied / Site visit / Quoted / Won / Lost) · Quote number ·
  Next action · Date of next action.
- **Weekly:** follow up quotes that haven't had a reply, and close off stale enquiries.

## 5. Reply templates

Edit these to suit. They make no promises about response times or outcomes.

**A. Acknowledgement**

> Hi [Name],
>
> Thanks for your enquiry about [service] in [suburb]. I'll review the details and get back to you
> about next steps. If you can, please reply with a few photos of the areas you'd like covered (and
> of any existing equipment, such as the alarm panel or recorder). That helps me give you an
> accurate quote.
>
> Kind regards,
> [Your name]
> ASTO Security

**B. Arranging a site visit**

> Hi [Name],
>
> Thanks for the photos. To quote accurately I'd like to take a quick look on site. Would any of
> these times suit? [options]
>
> Kind regards, [Your name], ASTO Security

**C. Sending a quote**

> Hi [Name],
>
> Please find attached quote [number] for [service]. It sets out the equipment, the work included
> and anything excluded. The quote is valid for [x] days. Just reply if you have any questions or
> would like to go ahead.
>
> Kind regards, [Your name], ASTO Security

**D. Outside scope**

> Hi [Name],
>
> Thanks for getting in touch. Unfortunately this job is outside the work ASTO Security currently
> takes on, so I'm not the right fit for it. I'd suggest contacting a [type of] specialist.
>
> Kind regards, [Your name], ASTO Security

## 6. Privacy habits

- Use enquiry details only to respond and to quote (this matches the website's privacy notice).
- Never ask customers to email alarm codes, passwords or remote-access logins.
- Delete enquiries and spreadsheet rows you no longer need, and keep the inbox and the Formspree
  account protected with strong, unique passwords and two-factor authentication.
- Don't store customer documents in the website's GitHub repository. It is public.
