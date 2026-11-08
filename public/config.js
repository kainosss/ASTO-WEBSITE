/*
 * ASTO SECURITY — public site settings (everything here is visible in the browser).
 *
 * The enquiry form is switched on and off by the Cloudflare Worker (see docs/enquiry-form-setup.md),
 * not by this file. Never put passwords, API keys or secrets here.
 *
 * contactEmail: optional business address to show beside the form, e.g. 'admin@astosec.com'.
 *               Leave empty to show no address.
 */
window.ASTO_CONFIG = {
  contactEmail: 'admin@astosec.com',
};
