// Content names (lane A API over lane B's table, docs/agent-notes/i18n-core.md "Content names").
// Russian comes from i18n/ru/names.js, keyed by content id; the English defs of the content tables themselves
// (shared/content: generated, never edited) are the fallback for an id the Russian table lacks (and such an id counts
// in "Name ×3" form, so a sentence never gets English grammar glued to Russian).
//
//   name(id, { form?, family? }) -> string    form: 'label' (default: a title or a button, "Пшеница"), 'short' (tight
//                                             labels, "Тростник"), 'lc' (inside a sentence, "пшеница"), 'pl' (plural),
//                                             'count' (after a number: "моркови"), 'def' ("амбар", the subject),
//                                             'defObj' ("амбар", object / after a preposition), 'plDef' ("грядки")
//   qty(id, n, { family?, form? }) -> string  "12 морковок" | "3 снопа пшеницы" | "1 яйцо"
//                                             form 'chip': "пшеница ×5" (inventory chips, tight lists)
//   N(id, family?) / Q(id, n, family?)        refs for t() params: t('x', { crop: N('wheat') }) and in the catalog
//                                             '{crop}' '{crop:def}' '{crop:count}'; '{q}' renders the quantity
//   gender(id) -> 'm' | 'f' | 'n' | 'pl' | null   the Russian gender (adjective agreement: catalog { m, f, n })
//   ctext(family, id, field, english) -> any  a content text field (a description, a letter's body) in Russian, else the
//                                             English value given
//   setNameOverlay({ ru: { [id]: entry } })   (additive, Harness Hollow mods lane; harness contract §2.6) a farm's mod
//                                             things' Russian entries, merged over ru/names.js; English comes from the
//                                             installed defs (the English index is rebuilt)
//
// Entry shape in i18n/ru/names.js (lane B), keyed by content id ('family:id' overrides an id shared by families):
//   { name: 'Морковь', g: 'f', pl: 'моркови', count: 'морковки', def: 'морковь', defObj: 'морковь', plDef: 'моркови',
//     short?: 'Морковь', lc?: 'морковь', proper?: true (keeps its capital in a sentence),
//     unit?: ['сноп', 'снопа', 'снопов'] (a mass noun: the unit word after 1, after 2–4, after 5+), desc?: '...' }
import { data, registerData, setRefRenderer, touchTwin } from './core.js';
import { fmtNum } from './core.js';
import { CONTENT, PLACEABLES, itemOf, pluralOf, lookup } from '../../../shared/content/index.js';
import ruNames from './ru/names.js';
import ruText from './ru/text.js';

registerData('names', ruNames);
registerData('text', ruText);

/** The English def for an id: placeables first, then items, then any family that has it. */
const enIndex = new Map();
function enDef(id, family) {
  if (family) {
    try { const d = lookup(family, id); if (d) return d; } catch { /* not a family */ }
  }
  const d = PLACEABLES.get(id) ?? itemOf(id);
  if (d) return d;
  if (!enIndex.size) {
    for (const m of Object.values(CONTENT)) {
      if (!(m instanceof Map)) continue;
      for (const [k, v] of m) if (!enIndex.has(k)) enIndex.set(k, v);
    }
  }
  return enIndex.get(id) ?? null;
}
const enName = (id, family) => {
  const d = enDef(id, family);
  return (d && (d.name ?? d.title)) || String(id ?? '').replace(/_/g, ' ');
};

let modNames = {};
/** A farm's mod things' Russian entries (Harness Hollow); the English index follows the installed content. */
export function setNameOverlay(overlay = {}) {
  modNames = overlay && overlay.ru && typeof overlay.ru === 'object' ? { ...overlay.ru } : {};
  enIndex.clear();
}

/** The Russian entry for an id (or null: the English name is shown). */
export function entry(id, family) {
  if (typeof id === 'string' && Object.hasOwn(modNames, id)) return modNames[id];
  const tbl = data('names');
  if (!tbl) return null;
  const n = tbl.names ?? tbl;
  return (family && n[`${family}:${id}`]) || n[id] || null;
}

const lowerFirst = (s) => (s ? s[0].toLocaleLowerCase('ru') + s.slice(1) : s);

/** A content name in the asked form (see the header). */
export function name(id, { form = 'label', family } = {}) {
  const e = entry(id, family);
  if (!e) {
    const en = enName(id, family);
    // an id the Russian table lacks: the English name as-is ('pl'/'count' count it in "Name ×3" form)
    return form === 'pl' || form === 'count' ? pluralOf(en, 2) : en;
  }
  const lc = e.lc ?? (e.proper ? e.name : lowerFirst(e.name));
  switch (form) {
    case 'short': return e.short ?? e.name;
    case 'lc': return lc;
    case 'pl': return e.pl ?? lc;
    case 'count': return e.count ?? e.pl ?? lc;
    case 'def': return e.def ?? lc;
    case 'defObj': return e.defObj ?? e.def ?? lc;
    case 'plDef': return e.plDef ?? (e.unit ? e.def : e.pl) ?? lc;   // a mass noun: "пшеницата"
    case 'cap': return e.name;
    default: return e.name;
  }
}

/** The Russian gender of a content name ('m' | 'f' | 'n' | 'pl'), or null. */
export function gender(id, family) {
  const e = entry(id, family);
  return e ? e.g ?? null : null;
}

/**
 * `n` of a thing, as a sentence says it: "12 морковок", "3 снопа пшеницы", "1 яйцо"; an id without an entry counts in
 * "Name ×3" form. form 'chip': "пшеница ×5".
 */
export function qty(id, n, { family, form } = {}) {
  const v = Number(n) || 0;
  const e = entry(id, family);
  if (form === 'chip') return `${e ? name(id, { form: 'lc', family }) : enName(id, family)} ×${fmtNum(v)}`;
  if (!e) return `${enName(id, family)} ×${fmtNum(v)}`;
  const one = v === 1;
  if (Array.isArray(e.unit)) return `${fmtNum(v)} ${one ? e.unit[0] : e.unit[1] ?? e.unit[0]} ${name(id, { form: 'lc', family })}`;
  if (one) return `1 ${e.one ?? name(id, { form: 'lc', family })}`;
  return `${fmtNum(v)} ${e.g === 'm' ? e.count ?? e.pl : e.pl ?? e.name}`;
}

/** A content-name ref for t() params ('{crop}', '{crop:def}'). */
export const N = (id, family) => ({ $name: id, family });
/** A quantity ref for t() params ('{q}' -> "12 моркова"; '{q:chip}' -> "морков ×12"; '{q:name}' the bare count noun). */
export const Q = (id, n, family) => ({ $qty: id, n, family });

setRefRenderer((ref, form) => {
  if (Object.hasOwn(ref, '$qty')) {
    if (form === 'chip') return qty(ref.$qty, ref.n, { family: ref.family, form: 'chip' });
    // a float over the farm: an id with an entry counts properly; one without shows the bare English name
    if (form === 'float') return entry(ref.$qty, ref.family) ? qty(ref.$qty, ref.n, { family: ref.family }) : `${fmtNum(ref.n)} ${enName(ref.$qty, ref.family)}`;
    if (form === 'noun') {
      // the noun alone as it follows this count ("морковок"), for a sentence that prints the number itself
      const e = entry(ref.$qty, ref.family);
      if (!e) return pluralOf(enName(ref.$qty, ref.family), ref.n);
      if (Array.isArray(e.unit)) return `${ref.n === 1 ? e.unit[0] : e.unit[1] ?? e.unit[0]} ${name(ref.$qty, { form: 'lc', family: ref.family })}`;
      return ref.n === 1 ? e.one ?? name(ref.$qty, { form: 'lc', family: ref.family }) : e.g === 'm' ? e.count ?? e.pl : e.pl ?? e.name;
    }
    return qty(ref.$qty, ref.n, { family: ref.family });
  }
  return name(ref.$name, { form: form || 'label', family: ref.family });
}, (ref) => gender(ref.$name ?? ref.$qty, ref.family));

/**
 * A content text field in Russian: from i18n/ru/text.js ({ [family]: { [id]: { field } } }, lanes B and C) when it has
 * one, else the English value the caller already holds. `field` may be a path ('letter.body').
 */
export function ctext(family, id, field, english) {
  if (field === 'desc' || field === 'name') {
    const e = entry(id, family);
    if (e && e[field] !== undefined) {
      if (field === 'desc') touchTwin(e.desc, e.descTouch);        // its words for a finger (ui/dom.js touchText)
      return e[field];
    }
  }
  const tbl = data('text');
  let v = tbl && tbl[family] && tbl[family][id];
  let parent = null;
  for (const part of String(field).split('.')) { parent = v; v = v && typeof v === 'object' ? v[part] : undefined; }
  // a text that names a key keeps its touch words next to it ({ text, touchText }, as features' cards always did)
  if (typeof v === 'string' && /(^|\.)text$/.test(field) && parent) touchTwin(v, parent.touchText);
  return v === undefined || v === null ? english : v;
}
