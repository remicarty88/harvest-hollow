// Движок i18n (дорожка A): активный язык, каталоги, t()/tn()/tNodes() и локализованные форматтеры.
// Одна листовая зависимость (net/lazy.js), без DOM при импорте (node-тесты импортируют модуль), без собственных
// каталогов: запись игры (i18n/index.js) регистрирует все области, а посадочная страница — только свою
// (i18n/multi.js, i18n/front.js; возврат в игру — i18n/keep.js по требованию), чтобы входная дверь не скачивала
// текст игры. Язык в игре один — русский, поэтому ленивой загрузки каталогов больше нет: всё приходит статически.
//
//   lang() -> 'ru'                            язык в действии
//   setLang(l) -> Promise                     оставлен ради совместимости: принимает только 'ru'
//   onLang(fn(lang)) -> off                   подписка на смену языка (в игре смены нет, слушатели не зовутся)
//   ready() -> Promise                        первые каталоги на месте (main.js ждёт перед отрисовкой UI)
//   loaded() -> Promise                       то же для областей, зарегистрированных позже
//   register(area, ru)                        каталог области на русском
//   registerData(name, value) / data(name)    данные, не являющиеся каталогом (таблица контентных имён)
//
//   t(key, params?) -> string                 целое предложение с именованными параметрами: 'Продано {n} за {coins} монет'
//   tn(key, n, params?) -> string             то же со счётчиком: значение каталога { one, other } выбирается по
//                                             Intl.PluralRules('ru'), {n} — отформатированный счётчик
//   tNodes(key, params?) -> DocumentFragment  то же предложение с DOM-узлами для Node-параметров (имя игрока в своём
//                                             <span class="actor">), остальное — текст
//   has(key) -> boolean
//   live(map) / liveRows(rows)                объекты / строки [k, label], подписи которых читаются по ключу каталога
//                                             в момент обращения (экспортируемые константы, обязанные следовать языку)
//
// Подстановки: {name} или {name:form}; {name:omit} не выводит ничего (перевод, который намеренно опускает
// параметр). Числовой параметр форматируется для локали (47 219, 1,5); ссылка на контентное имя (i18n/names.js
// N(id) / Q(id, n)) выводится в запрошенной форме ({crop:def}, {crop:count}); строка принимает :cap / :lc.
// {x:a} / {x:A} у русского артикля нет — параметр выводится как есть.
// Значение каталога может быть объектом: { one, other } (множественное, по params.n) или { m, f, n, pl, other }
// (род, по params.$g, иначе по роду первой ссылки на контентное имя в параметрах), либо { touch, other } (строка,
// называющая клавишу: её слова для пальца, по params.$touch; см. touchOf). Формы вкладываются: { touch: { one, other }, other: { … } }.
//
// Форматтеры: fmtNum(n) (целые), fmtDec(n, digits), fmtShort(n), fmtDuration(ms, opts), fmtDate(ts, style | Intl
// options, tz?), fmtPct(n), list(items, 'and' | 'or'), ordinal(n, g).

/** Язык игры. Один: русский. */
export const LANGS = Object.freeze(['ru']);
/** Название языка на нём самом (подписи выбора языка): никогда не переводится. */
export const LANG_NAMES = Object.freeze({ ru: 'Русский' });
/** Локаль чисел и дат. */
const NUM_LOCALE = { ru: 'ru-RU' };
const DATE_LOCALE = { ru: 'ru-RU' };
export const STORAGE_KEY = 'hh.lang';

const isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';

/** Язык устройства. Язык в игре один, поэтому всегда 'ru'. */
export function detectLang(stored, navLangs = []) {
  return 'ru';
}

let cur = 'ru';

/** area -> каталог области */
const areas = new Map();
/** name -> данные, не являющиеся каталогом (таблица контентных имён) */
const datas = new Map();
const CAT = Object.create(null);
const listeners = new Set();

/** Язык в действии. */
export const lang = () => cur;
/** Язык, к которому идёт переключение (в игре всегда равен lang()). */
export const wantedLang = () => cur;

/** Первые каталоги на месте (каталоги приходят статически, так что это сразу). */
export function ready() {
  return Promise.resolve();
}

/** Все области, зарегистрированные к этому моменту, на месте (для модулей, импортированных по требованию). */
export function loaded() {
  return Promise.resolve();
}

/** Зарегистрировать область: её русский каталог. Повторный вызов для той же области ничего не делает. */
export function register(name, ru) {
  if (areas.has(name)) return;
  for (const k of Object.keys(ru || {})) {
    if (Object.hasOwn(CAT, k)) console.warn(`i18n: ключ '${k}' объявлен дважды (область '${name}')`);
    CAT[k] = ru[k];
  }
  areas.set(name, ru);
}

/** Данные, не являющиеся каталогом (таблица контентных имён). */
export function registerData(name, value) {
  if (!datas.has(name)) datas.set(name, value);
}
export function data(name) {
  return datas.get(name) ?? null;
}

function emit() {
  for (const fn of [...listeners]) {
    try { fn(cur); } catch (err) { console.error('i18n: слушатель языка упал', err); }
  }
  if (isBrowser) {
    try { window.dispatchEvent(new CustomEvent('hh:lang', { detail: { lang: cur } })); } catch { /* старый браузер */ }
  }
}

/** Сменить язык. Язык один, поэтому вызов с 'ru' (или любым другим значением) просто возвращает 'ru'. */
export async function setLang(l, { persist = true } = {}) {
  if (l === 'ru' && persist) {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, 'ru'); } catch { /* приватное окно: только эта страница */ }
  }
  if (isBrowser) document.documentElement.lang = cur;
  return cur;
}

/** Вызвать fn(lang) после каждой смены языка. Возвращает функцию отписки. */
export function onLang(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- поиск и форматирование ---------------------------------------------------------------------------------------
const GENDER_KEYS = ['m', 'f', 'n', 'pl'];
const PLURAL_KEY_NAMES = ['one', 'few', 'many'];
const pluralRules = new Intl.PluralRules('ru');
const pluralOfN = (n) => pluralRules.select(Number(n) || 0);

/** Сырое значение каталога по ключу. */
export function raw(key) {
  return CAT[key];
}
export const has = (key) => raw(key) !== undefined;
/** Ключи, которых не было в каталоге за эту сессию (чек-лист для консоли разработчика). */
export const missingKeys = () => [];

let refRender = null;
let refGender = null;
/** names.js подключает то, как выводятся ссылки на контентные имена ({crop:def}) и какой у них род. */
export function setRefRenderer(render, gender) { refRender = render; refGender = gender; }
const isRef = (v) => v && typeof v === 'object' && (Object.hasOwn(v, '$name') || Object.hasOwn(v, '$qty'));

function pick(v, params) {
  for (let i = 0; i < 4 && v && typeof v === 'object' && !Array.isArray(v); i++) {
    const keys = Object.keys(v);
    if (Object.hasOwn(v, 'touch')) {
      v = params && params.$touch ? v.touch : v.other;
    } else if (keys.some((k) => PLURAL_KEY_NAMES.includes(k))) {
      const n = params && (params.n ?? params.count);
      v = v[pluralOfN(n)] ?? v.other;
    } else if (keys.some((k) => GENDER_KEYS.includes(k))) {
      let g = params && params.$g;
      if (!g && params && refGender) {
        for (const p of Object.values(params)) if (isRef(p)) { g = refGender(p); break; }
      }
      v = v[g] ?? v.other ?? v.m ?? v[keys[0]];
    } else {
      v = v.other ?? v[keys[0]];
    }
  }
  return v;
}

function cap(s) { return s ? s[0].toLocaleUpperCase(cur) + s.slice(1) : s; }
function lc(s) { return s ? s[0].toLocaleLowerCase(cur) + s.slice(1) : s; }

/** Один параметр как текст, в запрошенной форме ('omit': перевод, намеренно опускающий параметр). */
function paramText(v, form) {
  // артиклей у русского нет: {x:a} / {x:A} просто выводят параметр
  if (v === null || v === undefined || form === 'omit') return '';
  if (isRef(v)) return refRender ? refRender(v, form) : String(v.$name ?? v.$qty);
  if (typeof v === 'number') return Number.isInteger(v) ? fmtNum(v) : fmtDec(v, 2);
  if (typeof v === 'object' && typeof v.textContent === 'string') {
    return form === 'cap' || form === 'A' ? cap(v.textContent) : v.textContent;
  }
  const s = String(v);
  return form === 'cap' || form === 'A' ? cap(s) : form === 'lc' ? lc(s) : s;
}

const PH = /\{([A-Za-z_$][\w$]*)(?::([\w-]+))?\}/g;

/** Заполнить подстановки строки каталога (неизвестные остаются видимыми: пропавший параметр должен быть виден). */
export function format(str, params) {
  if (typeof str !== 'string' || !params) return typeof str === 'string' ? str : String(str ?? '');
  return str.replace(PH, (m, k, form) => (Object.hasOwn(params, k) ? paramText(params[k], form) : m));
}

/** Целое предложение по ключу, с именованными параметрами. Неизвестный ключ показывает себя. */
export function t(key, params) {
  const r = raw(key);
  const v = pick(r, params);
  if (v === undefined) return key;
  const out = format(v, params);
  remember(out, key, params);
  if (r && typeof r === 'object' && Object.hasOwn(r, 'touch') && !(params && params.$touch)) {
    touchTwin(out, format(pick(r, { ...params, $touch: true }), params));
  }
  return out;
}

// ---- варианты для пальца ------------------------------------------------------------------------------------------
// Строка, называющая клавишу («Закрыть (Esc)»), несёт свои слова для пальца: { touch: 'Закрыть', other: 'Закрыть (Esc)' }.
// t() говорит `other`, если не задан params.$touch, и запоминает пару, чтобы ui/dom.js touchText(text, true) мог
// подменить подсказку, собранную раньше (data-tip), в момент показа, никогда не переписывая переведённый текст.
// Контентные тексты регистрируют свои так же (names.js ctext: `touchText` рядом с `text`, `descTouch` рядом с `desc`).
const TWINS_MAX = 400;
const twins = new Map();
/** Запомнить, что `text` для игрока с пальцем читается как `touchText`. */
export function touchTwin(text, touchText) {
  if (typeof text !== 'string' || typeof touchText !== 'string' || text === touchText) return;
  if (twins.has(text)) twins.delete(text);
  twins.set(text, touchText);
  if (twins.size > TWINS_MAX) twins.delete(twins.keys().next().value);
}
/** Слова для пальца строки, которой каталог (или контентный текст) их дал, иначе undefined. */
export const touchOf = (text) => (typeof text === 'string' ? twins.get(text) : undefined);

// ---- сказать строку заново ----------------------------------------------------------------------------------------
// Тост, уведомление или баннер на экране переживают перерисовку. t() и list() запоминают, как они сделали свои
// последние строки (ограниченная карта, новые в конце), чтобы оболочка могла повторить такую строку без передачи
// функции: retell(text) -> () => string, или null для текста, который сделали не они (строка чата, склейка в коде).
const TOLD_MAX = 600;
const LIST = Symbol('list');
const told = new Map();
function remember(text, key, params) {
  if (told.has(text)) told.delete(text);
  told.set(text, [key, params]);
  if (told.size > TOLD_MAX) told.delete(told.keys().next().value);
}

/** Функция, которая скажет `text` заново, или null, если его сделали не t() / list(). Вызывать сразу (память коротка). */
export function retell(text, depth = 0) {
  if (typeof text !== 'string' || depth > 3) return null;
  const hit = told.get(text);
  if (!hit) return null;
  const [key, params] = hit;
  const again = (v) => (typeof v === 'string' && v !== text ? retell(v, depth + 1) : null);
  if (key === LIST) {
    const [items, type] = params;
    const parts = items.map((v) => [v, again(v)]);
    return () => list(parts.map(([v, fn]) => (fn ? fn() : v)), type);
  }
  if (!params) return () => t(key);
  const ps = Object.entries(params).map(([k, v]) => [k, v, again(v)]);
  return () => t(key, Object.fromEntries(ps.map(([k, v, fn]) => [k, fn ? fn() : v])));
}

/** t() со счётчиком: { one, other } по правилам русского множественного; {n} — отформатированный счётчик. */
export function tn(key, n, params) {
  return t(key, { ...params, n });
}

/** То же предложение как DOM: Node-параметры вставляются как есть (имя фермера в своём span), остальное — текстом. */
export function tNodes(key, params = {}) {
  const v = pick(raw(key), params);
  const str = v === undefined ? key : String(v);
  const frag = document.createDocumentFragment();
  let at = 0;
  PH.lastIndex = 0;
  for (let m = PH.exec(str); m; m = PH.exec(str)) {
    const [whole, k, form] = m;
    if (!Object.hasOwn(params, k)) continue;
    if (m.index > at) frag.append(str.slice(at, m.index));
    const p = params[k];
    const isNode = p && typeof p === 'object' && typeof p.nodeType === 'number';
    frag.append(isNode ? p : paramText(p, form));
    at = m.index + whole.length;
  }
  if (at < str.length) frag.append(str.slice(at));
  return frag;
}

/** Объект, значения которого — ключи каталога, читаемые в момент обращения (для экспортируемых констант). */
export function live(keys) {
  const o = {};
  for (const [k, key] of Object.entries(keys)) Object.defineProperty(o, k, { get: () => t(key), enumerable: true });
  return Object.freeze(o);
}
/** Объект геттеров из объекта функций (вложенные тоже): экспортируемые таблицы текста читают язык при обращении. */
export function getters(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'function') Object.defineProperty(out, k, { get: v, enumerable: true });
    else out[k] = v && typeof v === 'object' ? getters(v) : v;
  }
  return Object.freeze(out);
}
/** [[left, labelKey], ...]: вторая колонка читается через t() в момент обращения (списки клавиш). */
export function liveRows(rows) {
  return Object.freeze(rows.map(([left, key]) => {
    const row = [left, undefined];
    Object.defineProperty(row, 1, { get: () => t(key), enumerable: true });
    return Object.freeze(row);
  }));
}

/** Разметить статическую разметку: [data-i18n="key"] задаёт текст, [data-i18n-attr="aria-label:key; title:key"] — атрибуты. */
export function applyStatic(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const k = el.getAttribute('data-i18n');
    if (has(k)) el.textContent = t(k);
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
      const [attr, k] = pair.split(':').map((s) => s.trim());
      if (attr && k && has(k)) el.setAttribute(attr, t(k));
    }
  }
}

// ---- числа --------------------------------------------------------------------------------------------------------
const nf = new Map();
function numFormat(digits) {
  const k = `${cur}:${digits}`;
  let f = nf.get(k);
  if (!f) { f = new Intl.NumberFormat(NUM_LOCALE[cur] ?? cur, { maximumFractionDigits: digits }); nf.set(k, f); }
  return f;
}
/** Целое число для локали: 12 340 (неразрывный пробел как разделитель групп). */
export const fmtNum = (n) => numFormat(0).format(Math.trunc(Number(n) || 0));
/** Число с точностью до `digits` знаков: 1,5. */
export const fmtDec = (n, digits = 1) => numFormat(digits).format(Number(n) || 0);
/** Процент: 10%. */
export const fmtPct = (n, digits = 0) => `${fmtDec(n, digits)}%`;

/** Число, короткое для плашки: полное с группами до 999 999, дальше «1,2 млн.». */
export function fmtShort(n) {
  const v = Math.trunc(Number(n) || 0);
  const a = Math.abs(v);
  if (a < 1_000_000) return fmtNum(v);
  return `${fmtDec(v / 1_000_000, 1)} млн.`;
}

// ---- длительности -------------------------------------------------------------------------------------------------
const NB = '\u00a0';                                     // неразрывный пробел: строка не заканчивается голым числом
const daysWord = (n) => ({ one: 'день', few: 'дня', many: 'дней' }[pluralOfN(n)] ?? 'дней');
const UNITS = {
  s: (n) => `${n}${NB}с`,
  m: (n) => `${n}${NB}мин`,
  h: (n) => `${n}${NB}ч`,
  d: (n) => `${n}${NB}${daysWord(n)}`,
};
/**
 * Длительность: '2 ч 05 мин' | '4 мин 10 с' | '12 с' | '3 дня 4 ч'. Никогда не отрицательная. Опции:
 *   trim: true          убрать нулевую вторую часть ('2 ч', '4 мин', '3 дня')
 *   cut: '<units><op>'  убрать вторую часть, когда её единица входит в <units> (h, m, s) и условие держится:
 *                       '<10' (значение меньше десяти), '=0' (ноль) или ничего (всегда).
 */
export function fmtDuration(ms, { trim = false, cut = null } = {}) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const u = UNITS;
  const pad = (n) => String(n).padStart(2, '0');
  const rule = typeof cut === 'string' ? /^([hms]+)(<10|=0)?$/.exec(cut) : null;
  const drops = (unit, v) => (trim && v === 0) || Boolean(rule && rule[1].includes(unit)
    && (rule[2] === '<10' ? v < 10 : rule[2] === '=0' ? v === 0 : true));
  const two = (a, unit, v, fmt2) => (drops(unit, v) ? a : `${a} ${fmt2}`);
  if (s < 60) return u.s(s);
  const m = Math.floor(s / 60);
  if (m < 60) return two(u.m(m), 's', s % 60, u.s(pad(s % 60)));
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return two(u.h(hrs), 'm', m % 60, u.m(pad(m % 60)));
  return two(u.d(Math.floor(hrs / 24)), 'h', hrs % 24, u.h(hrs % 24));
}

// ---- даты ---------------------------------------------------------------------------------------------------------
const DATE_STYLES = {
  long: { weekday: 'long', day: 'numeric', month: 'long' },
  short: { weekday: 'short', day: '2-digit', month: '2-digit' },
  day: { day: 'numeric', month: 'long' },
  weekday: { weekday: 'long' },
  weekdayShort: { weekday: 'short' },
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  dayTime: { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false },
};
const df = new Map();
/**
 * Дата или время для чтения людьми, в локали языка: стиль 'long' (воскресенье, 12 октября), 'short' (вс, 12.10),
 * 'day', 'weekday', 'weekdayShort', 'time' (20:00), 'dayTime' или Intl options. `tz` — зона IANA (фермы), иначе
 * зона устройства. Никогда для логики (calendar.js).
 */
export function fmtDate(ts, style = 'long', tz = undefined) {
  const opts = typeof style === 'string' ? DATE_STYLES[style] ?? DATE_STYLES.long : style;
  const k = `${cur}:${JSON.stringify(opts)}:${tz ?? ''}`;
  let f = df.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat(DATE_LOCALE[cur] ?? cur, tz ? { ...opts, timeZone: tz } : opts); } catch { f = new Intl.DateTimeFormat(DATE_LOCALE[cur] ?? cur, opts); }
    df.set(k, f);
  }
  return f.format(new Date(Number(ts) || 0));
}

// ---- списки и порядковые ------------------------------------------------------------------------------------------
const lf = new Map();
/** «яблоки, груши и сливы» ('or': «яблоки, груши или сливы»). */
export function list(items, type = 'and') {
  const arr = (items || []).filter((x) => x !== null && x !== undefined && x !== '').map(String);
  const k = `${cur}:${type}`;
  let f = lf.get(k);
  if (!f) { f = new Intl.ListFormat(cur, { type: type === 'or' ? 'disjunction' : 'conjunction', style: 'long' }); lf.set(k, f); }
  const out = f.format(arr);
  if (arr.length > 1) remember(out, LIST, [arr, type]);
  return out;
}

/** Порядковое: «1-й», «2-я», «3-е» — окончание по роду существительного g ('m' | 'f' | 'n' | 'pl'). */
export function ordinal(n, g = 'm') {
  const v = Math.trunc(Number(n) || 0);
  const end = g === 'f' ? 'я' : g === 'n' || g === 'pl' ? 'е' : 'й';
  return `${v}-${end}`;
}

/** "+25" / "−10" (настоящий минус). */
export function fmtSigned(n) {
  const v = Math.trunc(Number(n) || 0);
  if (v > 0) return `+${fmtNum(v)}`;
  if (v < 0) return `−${fmtNum(-v)}`;
  return fmtNum(0);
}

/** Тестовый хук: раньше переключал язык. Язык один, поэтому ничего не делает. */
export function __setForTest() { /* язык один */ }
/** Тестовый хук: раньше догружал каталоги. Язык один, каталоги уже на месте. */
export async function __loadForTest() { /* каталоги статичны */ }
