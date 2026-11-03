# ASTO Security business templates

Editable, printable A4 templates. They are **not** part of the public website: Cloudflare serves
only `public/`.

| File | Use |
|---|---|
| `installation-quote.html` | Quotation for CCTV, alarm or maintenance work |
| `invoice.html` | Customer (tax) invoice |
| `cctv-handover.html` | CCTV installation handover record |
| `alarm-handover.html` | Intruder alarm installation handover record |
| `maintenance-report.html` | Preventative maintenance / service report |

## How to use

1. Open the file in Chrome, Edge or Safari. The fonts load from Google Fonts when online and fall
   back to Arial offline.
2. Click any text to edit it. Yellow-highlighted `[placeholders]` need your details. Replace or
   delete them before sending.
3. Select **Print / Save as PDF**, choose A4 and "Save as PDF", and send the PDF to the customer.

Set up your business details once: edit the header block (legal/trading name, ABN, Queensland
security licence number if applicable, phone, email, postal address) in each template, then
commit those blank-but-branded templates.

## Important

- **The GitHub repository is public.** Never commit completed documents. They contain customer
  names, addresses and prices. Save completed copies elsewhere, such as a private cloud folder.
  `.gitignore` already blocks `docs/business-templates/completed/`, `*.completed.html` and `*.pdf`
  as a safety net.
- Never write alarm codes, passwords or remote-access logins on any document.
- The templates include no warranty, payment, GST or legal terms of their own. Fill these in
  yourself, and confirm tax-invoice requirements, licensing and contract terms with your accountant
  or adviser.
