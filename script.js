/* ASTO SECURITY — website demo. No customer data is sent/stored by this demo. */
const SITE_CONFIG = {
  contactEmail: '', // Set to your verified business inbox to enable a prefilled email draft.
};

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
if (SITE_CONFIG.contactEmail) {
  const a = document.createElement('a');
  a.href = `mailto:${SITE_CONFIG.contactEmail}`;
  a.textContent = SITE_CONFIG.contactEmail;
  emailDisplay.append(a);
  emailDisplay.hidden = false;
}

const form = document.getElementById('enquiryForm');
const formFeedback = document.getElementById('formFeedback');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!SITE_CONFIG.contactEmail) {
    formFeedback.textContent = 'This is a design preview. The enquiry form has not been connected yet, so your details have not been sent.';
    return;
  }
  const data = new FormData(form);
  const get = key => String(data.get(key) || '').trim();
  const subject = `ASTO Security enquiry: ${get('service')} — ${get('property')}`;
  const body = [
    `Name: ${get('fullName')}`, `Email: ${get('email')}`, `Phone: ${get('phone') || 'Not supplied'}`,
    `Property: ${get('property')}`, `Service: ${get('service')}`, '', 'Details:', get('message')
  ].join('\n');
  formFeedback.textContent = 'Your email app should open with a prepared message. You will need to press Send in your email app to submit it.';
  window.location.href = `mailto:${SITE_CONFIG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
