// The privacy page (public/privacy.html, served at /privacy in multi mode). The site is a single-language one now: the
// page carries one article, in Russian (data-lang="ru"), and this script shows it, sets the page's language and sends
// the privacy request form. The script's own words (the form's checks and answers) are the 'privacy' catalog area
// (privacy.page.*), in the one language; the article carries its own title (data-title).
// The request form checks what the server checks (server/ideas.js checkPrivacy) and POSTs /api/privacy; the words stay
// in the form on any refusal.
//
//   pickLang(...) -> 'ru'                                             pure
//   checkRequest({ kind, text, contact }) -> { ok } | { ok: false, field, code }   pure
//   sendRequest(fetch, fields) -> { ok, id } | { ok: false, code: 'RATE'|'FULL'|'BAD'|'NET', field? }   never throws
import { t, setLang } from './i18n/privacy.js';

export const LANGS = Object.freeze(['ru']);
/** The device's language choice (i18n/core.js STORAGE_KEY): one choice for every page of the site. */
export const LANG_KEY = 'hh.lang';
export const KINDS = Object.freeze(['idea', 'farm', 'copy', 'other']);
export const LIMITS = Object.freeze({ textMin: 10, textMax: 2000, contactMax: 120 });

const chars = (s) => [...String(s ?? '')].length;
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** The page's language. There is only one now, so this is always 'ru'. Pure. */
export function pickLang() {
  return 'ru';
}

/** What the server checks (server/ideas.js checkPrivacy), so the form can say what is wrong before it sends. Pure. */
export function checkRequest({ kind, text, contact = '' } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, field: 'kind', code: 'kind' };
  const t = String(text ?? '').trim();
  if (chars(t.replace(/\s+/g, ' ')) < LIMITS.textMin) return { ok: false, field: 'text', code: 'short' };
  if (chars(t) > LIMITS.textMax) return { ok: false, field: 'text', code: 'long' };
  if (chars(squash(contact)) > LIMITS.contactMax) return { ok: false, field: 'contact', code: 'contact' };
  return { ok: true };
}

/** POST /api/privacy (same origin). Never throws. */
export async function sendRequest(fetcher, { kind, text, contact = '', lang = null, website = '' }) {
  const body = { kind, text: String(text).trim() };
  if (squash(contact)) body.contact = squash(contact);
  if (lang) body.lang = lang;
  if (website) body.website = website;
  let res;
  try {
    res = await fetcher('/api/privacy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  } catch { return { ok: false, code: 'NET' }; }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.ok && json && typeof json.id === 'string') return { ok: true, id: json.id };
  if (res.status === 429) return { ok: false, code: 'RATE' };
  if (res.status === 503) return { ok: false, code: 'FULL' };
  if (res.status === 400) return { ok: false, code: 'BAD', field: json?.field ?? null };
  return { ok: false, code: 'NET' };
}

/** Wire the form. */
function wireForm(form, lang, { fetcher = (u, o) => globalThis.fetch(u, o) } = {}) {
  // the form's words, in the language shown (a form is only ever sent while its own language shows)
  const w = (code, params) => t(`privacy.page.${code}`, params);
  const done = form.parentElement.querySelector('.pv-done');
  const status = form.querySelector('.pv-status');
  const send = form.querySelector('.pv-send');
  const kinds = form.querySelector('.pv-kinds');
  const text = form.querySelector('textarea[name="text"]');
  const contact = form.querySelector('input[name="contact"]');
  const trap = form.querySelector('input[name="website"]');
  const errOf = (f) => form.querySelector(`[data-err="${f}"]`);
  const fieldOf = { kind: kinds, text, contact };
  for (const f of Object.keys(fieldOf)) {
    const err = errOf(f);
    if (!err.id) err.id = `${lang}-err-${f}`;
    // the error is read with its field: the radios' group and the two inputs point at it
    const target = f === 'kind' ? kinds : fieldOf[f];
    target.setAttribute('aria-describedby', [target.getAttribute('aria-describedby'), err.id].filter(Boolean).join(' '));
  }
  const say = (f, msg) => {
    const err = errOf(f);
    err.textContent = msg || '';
    err.hidden = !msg;
    fieldOf[f].setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const clear = () => { for (const f of Object.keys(fieldOf)) say(f, ''); status.textContent = ''; status.classList.remove('bad'); };
  const fields = () => ({ kind: form.querySelector('input[name="kind"]:checked')?.value ?? null, text: text.value, contact: contact.value });
  const sayCheck = (c) => {
    say(c.field, w(`err.${c.code}`, { min: LIMITS.textMin, max: c.field === 'contact' ? LIMITS.contactMax : LIMITS.textMax }));
    (c.field === 'kind' ? form.querySelector('input[name="kind"]') : fieldOf[c.field]).focus();
  };
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    clear();
    const f = fields();
    const c = checkRequest(f);
    if (!c.ok) { sayCheck(c); return; }
    busy = true;
    send.disabled = true;
    send.textContent = w('sending');
    form.setAttribute('aria-busy', 'true');
    const r = await sendRequest(fetcher, { ...f, lang, website: trap.value });
    busy = false;
    send.disabled = false;
    send.textContent = w('send');
    form.removeAttribute('aria-busy');
    if (r.ok) {
      form.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
      done.scrollIntoView?.({ block: 'center' });
      return;
    }
    if (r.code === 'BAD' && r.field && fieldOf[r.field]) { sayCheck({ field: r.field, code: r.field === 'text' ? 'short' : r.field }); return; }
    status.textContent = w(['RATE', 'FULL', 'BAD'].includes(r.code) ? `err.${r.code}` : 'err.NET');
    status.classList.add('bad');
  });
  for (const r of form.querySelectorAll('input[name="kind"]')) r.addEventListener('change', () => say('kind', ''));
}

/** Show the one article and mark the page's language. `keep` remembers it on the device. */
function show(lang, { doc = document, keep = false } = {}) {
  for (const a of doc.querySelectorAll('article.pv-doc')) {
    a.hidden = a.dataset.lang !== lang;
    if (!a.hidden && a.dataset.title) doc.title = a.dataset.title;         // the article names the page in its language
  }
  doc.documentElement.lang = lang;
  doc.documentElement.dataset.pvLang = lang;
  setLang(lang, { persist: keep });
}

function boot() {
  const lang = pickLang();
  show(lang);
  for (const h of document.querySelectorAll('.pv-h1')) h.tabIndex = -1;
  for (const form of document.querySelectorAll('form.pv-form')) wireForm(form, form.dataset.lang);
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView?.();
}

if (typeof document !== 'undefined' && document.getElementById('pv-main')) boot();
