/*
 * ASTO SECURITY — site configuration (public: everything here is visible in the browser).
 *
 * formEndpoint
 *   Leave empty ('') until ASTO's own Formspree form exists. While empty, the enquiry form stays
 *   clearly marked as "not connected yet" and sends nothing.
 *   When ready, paste ASTO's Formspree endpoint, e.g. 'https://formspree.io/f/abcdwxyz'
 *   (create it under ASTO's own Formspree account; never reuse another business's endpoint).
 *   A Formspree form ID is not a secret: it is always visible in a site's page source.
 *
 * contactEmail
 *   Optional. A verified ASTO business inbox to show beside the form, e.g. 'hello@example.com.au'.
 *   Leave empty to show no address.
 *
 * Never put passwords, API keys or private tokens in this file.
 */
window.ASTO_CONFIG = {
  formEndpoint: '',
  contactEmail: '',
};
