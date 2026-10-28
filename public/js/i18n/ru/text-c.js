// Русские контентные тексты, дорожка C (см. text.js): { [family]: { [id]: { [field]: value } } }, читается через
// i18n/names.js ctext(family, id, field, english). Письма, подсказки, заметки бабушки, реплики жителей, общие цели
// недели, ленты, альбом и доказательства на землю. Части c1–c4 пишутся по отдельности, здесь только объединяются (дорожка A).
import c1 from './text-c1.js';
import c2 from './text-c2.js';
import c3 from './text-c3.js';
import c4 from './text-c4.js';

function merge(a, z) {
  const out = { ...a };
  for (const [k, v] of Object.entries(z)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v;
  }
  return out;
}

export default merge(merge(c1, c2), merge(c3, c4));
