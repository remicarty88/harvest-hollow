// The way back in (area 'keep'): the engine plus that catalog only. ui/link-open.js and ui/qr-scan.js import this, as
// the landing page opens them on demand ("Already have a farm?"): inside the game i18n/index.js registers the same
// area (register() keeps the first).
import { register } from './core.js';
import keep from './ru/keep.js';

register('keep', keep);

export * from './core.js';
