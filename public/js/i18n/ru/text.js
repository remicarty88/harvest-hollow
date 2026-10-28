// Русские контентные тексты (описания, письма, подсказки...) по контентному семейству и id, повторяющие форму
// английских таблиц: { [family]: { [id]: { [field]: value } } }. Читается через i18n/names.js ctext(family, id, field, english).
// Контентный текст пишут две дорожки, каждая в своём файле: text-b.js (дорожка B: тексты рядом с именами, например ленты,
// коллекции, декор и роли NPC) и text-c.js (дорожка C: квесты и письма, карточки возможностей, TUTORIAL, STORY_BEATS,
// GRANDMA_VISIT, реплики NPC, COUPLE_CHALLENGE, ALMANAC, PLAYER_TEXT). Этот файл только объединяет их (дорожка A).
import b from './text-b.js';
import c from './text-c.js';

function merge(a, z) {
  const out = { ...a };
  for (const [k, v] of Object.entries(z)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v;
  }
  return out;
}

export default merge(b, c);
