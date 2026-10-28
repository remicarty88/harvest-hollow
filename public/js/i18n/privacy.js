// The privacy page's words (area 'privacy'): the engine plus that catalog only. js/privacy.js (public/privacy.html,
// whose articles carry the only language, Russian) imports this for its form's words and its title; inside the game
// i18n/index.js registers the same area (register() keeps the first).
import { register } from './core.js';
import privacy from './ru/privacy.js';

register('privacy', privacy);

export * from './core.js';
