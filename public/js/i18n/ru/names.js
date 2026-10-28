// Русские контентные имена (дорожка A): плоские части names-a…names-f2b собираются здесь в ту же форму, что и
// английская таблица: { [id]: запись }. 'family:id' перекрывает id, который делят два семейства (рецепты наследуют
// id предмета и своей записи не требуют; 'features:<id>' — имена возможностей, 'restoration:farmhouse' — дом бабушки
// как проект восстановления). Форма записи и словоформы описаны в шапке i18n/names.js.
//   name   подпись (заголовки, кнопки), обычный регистр: 'Морковь', 'Кормовая мельница'
//   g      'm' | 'f' | 'n' | 'pl'      pl / count / def / defObj / plDef: словоформы
//   short  подпись на панели / чипе    lc: форма в предложении, если это не просто строчная первая буква
//   one    единственное число, если подпись — множественное ('Сорняки')
//   unit   [после 1, после 2–4, после 5+] для вещественного: ['сноп', 'снопа', 'снопов']
//   desc   описание, если у контента оно есть (ctext(family, id, 'desc', def.text))
import a from './names-a.js';
import b from './names-b.js';
import c from './names-c.js';
import d from './names-d.js';
import e1a from './names-e1a.js';
import e1b from './names-e1b.js';
import e2 from './names-e2.js';
import f1a from './names-f1a.js';
import f1b from './names-f1b.js';
import f2a from './names-f2a.js';
import f2b from './names-f2b.js';

export const names = {
  ...a,
  ...b,
  ...c,
  ...d,
  ...e1a,
  ...e1b,
  ...e2,
  ...f1a,
  ...f1b,
  ...f2a,
  ...f2b,
};

export default { names };
