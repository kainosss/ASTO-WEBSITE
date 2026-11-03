/* ASTO SECURITY — site behaviour. Configuration lives in config.js (window.ASTO_CONFIG). */
const SITE_CONFIG = Object.assign({ contactEmail: '' }, window.ASTO_CONFIG || {});

const mobileToggle = document.getElementById('mobileToggle');
const mobileNav = document.getElementById('mobileNav');
function setMenu(open) {
  mobileToggle.setAttribute('aria-expanded', String(open));
  mobileToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  mobileNav.classList.toggle('is-open', open);
  mobileNav.inert = !open;
  document.body.classList.toggle('menu-open', open);
}
mobileToggle.addEventListener('click', () => setMenu(mobileToggle.getAttribute('aria-expanded') !== 'true'));
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
window.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
window.addEventListener('resize', () => { if (window.innerWidth > 760) setMenu(false); });

document.getElementById('year').textContent = String(new Date().getFullYear());

// Progressive reveal, respecting the visitor's reduced-motion preference.
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -22px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

const emailDisplay = document.getElementById('contactEmailDisplay');
if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SITE_CONFIG.contactEmail || '')) {
  const a = document.createElement('a');
  a.href = `mailto:${SITE_CONFIG.contactEmail}`;
  a.textContent = SITE_CONFIG.contactEmail;
  emailDisplay.append(a);
  emailDisplay.hidden = false;
}

// "Enquire about home/business security" links pre-select the property type.
document.querySelectorAll('a[data-property]').forEach(link => link.addEventListener('click', () => {
  const select = document.getElementById('property');
  if (select && !select.value) select.value = link.dataset.property;
}));

/* ---------- Enquiry form ----------
 * The form is live only when the site's Worker reports it is enabled (GET /api/enquiry/config). Otherwise it
 * stays in preview mode and sends nothing. Submissions go to POST /api/enquiry, which verifies Cloudflare
 * Turnstile and emails the enquiry; a success message is shown only when the server confirms the email was sent. */
const form = document.getElementById('enquiryForm');
const formFeedback = document.getElementById('formFeedback');
const submitButton = document.getElementById('formSubmit');
const submitLabel = submitButton.querySelector('.form-submit-label');
const turnstileBox = document.getElementById('turnstileWidget');
const openedAt = Date.now();
let sending = false;
let liveMode = false;
let turnstileToken = '';
let turnstileWidgetId = null;

const MESSAGES = {
  name: 'Please enter your name.',
  email: 'Please enter a valid email address, e.g. name@example.com.',
  phone: 'Please enter a valid phone number, or leave it blank.',
  suburb: 'Please enter your suburb.',
  service: 'Please choose the service you need.',
  property_type: 'Please choose a property type.',
  message: 'Please tell us a little about the job (at least 10 characters).',
};
const fields = [...form.querySelectorAll('input:not([name="website"]), select, textarea')];

function setFieldError(field, message) {
  const error = document.getElementById(`${field.id}-error`);
  field.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (!error) return;
  error.textContent = message || '';
  error.hidden = !message;
}
function validateField(field) {
  if (field.type !== 'select-one') field.value = field.value.replace(/^\s+/, '');
  const empty = !field.value.trim();
  const ok = field.checkValidity() && !(field.required && empty);
  setFieldError(field, ok ? '' : MESSAGES[field.name] || 'Please check this field.');
  return ok;
}
fields.forEach(field => {
  field.addEventListener('blur', () => { if (field.value || field.getAttribute('aria-invalid') === 'true') validateField(field); });
  field.addEventListener('input', () => { if (field.getAttribute('aria-invalid') === 'true') validateField(field); });
  field.addEventListener('change', () => { if (field.getAttribute('aria-invalid') === 'true') validateField(field); });
});

function showFeedback(text, state) {
  formFeedback.textContent = text;
  formFeedback.dataset.state = state;
}
function setSending(on) {
  sending = on;
  submitButton.disabled = on;
  form.setAttribute('aria-busy', String(on));
  submitLabel.textContent = on ? 'Sending…' : 'Send enquiry';
}
function resetTurnstile() {
  turnstileToken = '';
  if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
}

// Turn the form on only when the Worker says it is enabled, then load Cloudflare Turnstile.
async function enableLiveForm() {
  let config;
  try {
    const res = await fetch('/api/enquiry/config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return;
    config = await res.json();
  } catch { return; }
  if (!config || config.enabled !== true || !config.turnstileSiteKey) return;
  window.onAstoTurnstileLoad = () => {
    turnstileWidgetId = window.turnstile.render(turnstileBox, {
      sitekey: config.turnstileSiteKey,
      action: 'enquiry',
      appearance: 'interaction-only',
      callback: token => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = ''; },
      'error-callback': () => { turnstileToken = ''; },
    });
    liveMode = true;
    form.dataset.mode = 'live';
  };
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onAstoTurnstileLoad';
  script.async = true;
  script.defer = true;
  document.head.append(script);
}
enableLiveForm();

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending) return;
  const invalid = fields.filter(field => !validateField(field));
  if (invalid.length) {
    showFeedback(`Please check the ${invalid.length === 1 ? 'highlighted field' : `${invalid.length} highlighted fields`}.`, 'error');
    invalid[0].focus();
    return;
  }
  if (!liveMode) {
    showFeedback('This is a website preview. The enquiry form is not connected yet, so your details have not been sent.', 'preview');
    return;
  }
  // Simple spam checks: the hidden field is only ever filled in by bots, and people take more than a few seconds.
  if (form.elements.website.value) {
    showFeedback('Sorry, your enquiry could not be sent. Please try again.', 'error');
    return;
  }
  const elapsedMs = Date.now() - openedAt;
  if (elapsedMs < 3000) {
    showFeedback('Please take a moment to check your details, then select Send enquiry again.', 'error');
    return;
  }
  if (!turnstileToken) {
    showFeedback('Please wait a moment while we check this form is being used by a person, then select Send enquiry again.', 'error');
    return;
  }

  const get = name => String(form.elements[name].value || '').trim();
  const payload = {
    service: get('service'),
    name: get('name'),
    email: get('email'),
    phone: get('phone'),
    suburb: get('suburb'),
    property_type: get('property_type'),
    message: get('message'),
    website: form.elements.website.value,
    elapsedMs,
    turnstileToken,
  };

  setSending(true);
  showFeedback('Sending your enquiry…', 'sending');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/enquiry', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result && result.ok === true) {
      form.reset();
      fields.forEach(field => setFieldError(field, ''));
      showFeedback('Thank you. Your enquiry has been sent. We will reply by email or phone after reviewing your details.', 'success');
      formFeedback.focus();
      return;
    }
    if (result && result.fields) {
      Object.entries(result.fields).forEach(([name, message]) => {
        const field = form.elements[name];
        if (field && fields.includes(field)) setFieldError(field, message);
      });
    }
    const reason = result && result.error === 'verification_failed'
      ? 'the security check did not complete'
      : result && result.error === 'invalid' ? 'some details need checking' : '';
    showFeedback(`Sorry, your enquiry could not be sent${reason ? ` because ${reason}` : ''}. Please check your details and try again. Your details are still in the form.`, 'error');
  } catch {
    showFeedback('Sorry, your enquiry could not be sent. Please check your internet connection and try again. Your details are still in the form.', 'error');
  } finally {
    clearTimeout(timer);
    resetTurnstile();
    setSending(false);
  }
});
