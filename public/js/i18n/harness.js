// The in-game helper's words (area 'harness'): registered only when the helper's screens load (ui/harness/boot.js), so
// a game whose server offers no helper never loads them.
import { register } from './core.js';
import harness from './ru/harness.js';

register('harness', harness);

export * from './core.js';
