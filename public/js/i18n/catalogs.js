// Every catalog area of the game, one Russian module per area (the only language). One area = one lane's files, so
// two lanes never edit the same catalog (docs/agent-notes/i18n-core.md "Areas"). Lane A owns this list; every lane's
// areas are already in it: a lane fills its own ru/<area>.js and never needs to touch this file. Literal import()
// lines on purpose: the server versions every module it can find (server/static.js), and finds only literal specifiers.
import core from './ru/core.js';
import shell from './ru/shell.js';
import hud from './ru/hud.js';
import toolbar from './ru/toolbar.js';
import toasts from './ru/toasts.js';
import moments from './ru/moments.js';
import settings from './ru/settings.js';
import social from './ru/social.js';
import game from './ru/game.js';
import multi from './ru/multi.js';
import league from './ru/league.js';
import weekly from './ru/weekly.js';
import feed from './ru/feed.js';
import goals from './ru/goals.js';
import market from './ru/market.js';
import farm from './ru/farm.js';
import collect from './ru/collect.js';
import home from './ru/home.js';
import keep from './ru/keep.js';
import privacy from './ru/privacy.js';
import front from './ru/front.js';
import dock from './ru/dock.js';
import cheer from './ru/cheer.js';
import feat from './ru/feat.js';
import boot from './ru/boot.js';

/** [area, Russian catalog] in load order. */
export const AREAS = [
  // lane A: core and shell
  ['core', core],
  ['shell', shell],
  ['hud', hud],
  ['toolbar', toolbar],
  ['toasts', toasts],
  ['moments', moments],
  ['settings', settings],
  ['social', social],
  ['game', game],
  ['multi', multi],
  // lane B: league and weekly panels (the content names table is i18n/ru/names.js)
  ['league', league],
  ['weekly', weekly],
  // lane C: feed, Journal, goals and quests
  ['feed', feed],
  ['goals', goals],
  // lane D: economy, collect and home panels
  ['market', market],
  ['farm', farm],
  ['collect', collect],
  ['home', home],
  // multi-farm hosting: the keys (a lost device's way back), privacy, and the landing page's words (also the game's
  // ideas card and star card). 'keep' and 'front' are also registered on their own (i18n/keep.js, i18n/front.js) by
  // the modules the landing page shares: register() keeps the first.
  ['keep', keep],
  ['privacy', privacy],
  ['front', front],
  // release 1.0 (docs/agent-briefs/release-scope.md §3 step 0): one new area per lane, so no two lanes share a
  // catalog. dock: ui-shell; cheer: life-feel; feat: features; boot: infra (harvey keeps 'harness', infra 'front').
  ['dock', dock],
  ['cheer', cheer],
  ['feat', feat],
  ['boot', boot],
];

/**
 * Areas registered on demand by their own entry, not with the page (the tests check them like the others):
 * [area, () => import(ru)]. 'harness': the in-game helper (i18n/harness.js, loaded by ui/harness/boot.js only when
 * the farm's server offers the helper).
 */
export const LAZY_AREAS = [
  ['harness', () => import('./ru/harness.js')],
];

/** Every area with its Russian catalog loaded: [area, ru] (tests and tools). */
export const allAreas = async () => [...AREAS, ...await Promise.all(LAZY_AREAS.map(async ([a, ru]) => [a, (await ru()).default]))];
