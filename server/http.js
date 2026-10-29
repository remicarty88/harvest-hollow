// HTTP: static client, shared modules, vendored three.js, status, and dev routes (HH_DEV=1, loopback only).
//
// Caching and compression (SV-05) and the build identity (SV-03): server/static.js. In short: index.html is
// rendered with the build hash and an import map that gives every module a content-hashed URL (cached for a year,
// `immutable`); other `?v=` URLs are immutable too; anything unversioned revalidates (`no-cache` + ETag), so a
// reload after a server update always picks up new code; /vendor/three without a version is cached for a week;
// text-like files, GLB and WAV are served gzip'ed; model families and the sounds also come as one pack each (qa2 SV-03).
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { CONTENT_HASH } from '../shared/content/index.js';
import { RULES_VERSION } from '../shared/rules/index.js';
import { PROTOCOL_VERSION } from '../shared/net/protocol.js';
import { StaticFiles, REVALIDATE } from './static.js';
import { AssetOrigin } from './asset-origin.js';
import { firstViewPacks, modelFileOf, packShares, PREFETCHABLE, SINGLE_SHARE } from '../shared/net/packs-plan.js';
import { spawnAt } from '../shared/rules/grid.js';
import { farmMethods } from './farm-host.js';

export const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

/**
 * WebSocket compression for big frames only (release 1.0 O5, option2#11): the welcome and resyncs (the owners'
 * farm: a 153 KB welcome deflates to ~29 KB) are the slow link's whole job once option 2 moves the game files, on every
 * boot and every reconnect; small deltas and pongs (< 8 KB) are sent as they are and keep their latency. A small window
 * and memLevel keep the per-socket zlib memory low; two compressions at once at most. Both servers use it.
 * This replaces tech-architecture decision 9 ("LAN bandwidth is free"): the owners play over a 85 KB/s link.
 */
export const WS_DEFLATE = Object.freeze({ threshold: 8192, concurrencyLimit: 2, serverMaxWindowBits: 13,
  zlibDeflateOptions: Object.freeze({ level: 6, memLevel: 7 }) });

/** express.static options: the Cache-Control decided by StaticFiles.serveFiles (res.locals), else revalidate. */
export const staticOpts = { etag: true, lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', res.locals.cacheControl || REVALIDATE) };

/** The /api/status body (also logged by tools): no secrets, safe on the LAN. */
export function status(hh) {
  const now = hh.clock.now();
  const ps = hh.persist.stats;
  return {
    ok: !hh.engine.degraded && !ps.lastError,
    degraded: hh.engine.degraded,
    version: hh.cfg.version,
    proto: PROTOCOL_VERSION,
    rules: RULES_VERSION,
    contentHash: CONTENT_HASH,
    buildHash: hh.static ? hh.static.build : null,
    // option 2: where the game files come from (null: this server only; server/asset-origin.js)
    assets: hh.assetOrigin ? hh.assetOrigin.status : null,
    schema: hh.engine.state.schema,
    v: hh.engine.v,
    serverNow: now,
    startedAt: hh.startedAt,
    uptimeS: Math.floor((Date.now() - hh.startedAt) / 1000),
    tz: hh.engine.state.meta.tz,
    dev: hh.cfg.dev,
    slots: hh.sessions.slotList(),
    online: hh.sessions.onlinePids().sort(),
    connections: hh.sessions.conns.size,
    save: { lastAt: ps.lastSaveAt, lastV: ps.lastSaveV, lastBackupAt: ps.lastBackupAt, lastError: ps.lastError,
      journaled: ps.journaled },
    nextSystemDueAt: hh.scheduler.dueAt,
    // where server time goes (qa2 SV-02, server/perf.js): act, output wait, due wake-ups, loop delay, snapshots
    perf: hh.perf ? hh.perf.status(ps.timing || null) : null,
  };
}

/**
 * The game's files after the page itself: option 2's /b/<build>/ guard first (both modes; `host: false` is
 * HH_ASSET_HOST=off), asset packs, versioned/gzip'ed files, vendored three.js, shared modules, public/. Shared by the
 * single-farm app and the multi-farm host (server/multi.js).
 */
export function mountAssets(app, staticFiles, root, { host = true } = {}) {
  app.use(staticFiles.serveBuild({ enabled: host }));
  app.use(staticFiles.servePacks());        // /assets/packs/<id>.bin: a model family or the sounds in one response (qa2 SV-03)
  app.use(staticFiles.serveFiles());
  app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three'), staticOpts));
  app.use('/shared', express.static(path.join(root, 'shared'), staticOpts));
  app.use(express.static(path.join(root, 'public'), staticOpts));
}

/**
 * Dev routes (HH_DEV=1, loopback only). `farmOf(req)` resolves the farm context a request acts on (the one farm in
 * single mode; /api/f/:id/dev/... in multi mode), or null for 404.
 */
export function devRouter(farmOf) {
  const dev = express.Router({ mergeParams: true });
  dev.use((req, res, next) => (isLoopback(req.socket.remoteAddress) ? next() : res.status(403).json({ error: 'loopback only' })));
  dev.use(express.json({ limit: '4kb' }));
  const withFarm = (fn) => async (req, res) => {
    const hh = await farmOf(req);
    if (!hh) return res.status(404).json({ error: 'not found' });
    return fn(hh, req, res);
  };
  // `hh` is a FarmHost (server/farm-host.js; a modded multi-mode farm runs in a worker) or a plain farm context.
  const call = (hh, m, ...a) => (typeof hh.call === 'function' ? hh.call(m, ...a) : farmMethods(hh)[m](...a));
  // Jump game time forward. Due system actions run at once, as the scheduler would have run them.
  dev.post('/warp', withFarm(async (hh, req, res) => {
    const ms = Number(req.body && req.body.ms);
    if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 400 * 86_400_000) return res.status(400).json({ error: 'ms' });
    const now = await call(hh, 'devWarp', ms);
    return res.json({ ok: true, serverNow: now });
  }));
  // Cut a player's sockets (simulated sleep / Wi-Fi drop); the client reconnects on its own.
  dev.post('/drop', withFarm(async (hh, req, res) => {
    const pid = req.body && req.body.pid;
    if (typeof pid !== 'string') return res.status(400).json({ error: 'pid' });
    return res.json({ ok: true, dropped: await call(hh, 'devDrop', pid) });
  }));
  // Force a snapshot now (tests use it before a restart).
  dev.post('/save', withFarm(async (hh, _req, res) => {
    const v = await call(hh, 'devSave');
    res.json({ ok: true, v });
  }));
  return dev;
}

/** The shortest accepted HH_ADMIN_TOKEN (the same floor the ideas admin uses, server/ideas.js). */
export const MIN_ADMIN_TOKEN = 24;

/** Constant-time comparison of two secrets (both sides hashed first, so a length difference does not leak). */
function sameSecret(a, b) {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

/**
 * The owner's admin routes (HH_ADMIN_TOKEN, at least MIN_ADMIN_TOKEN characters; unset or short = off). Unlike the
 * dev routes this is NOT loopback-only: the owner may host the farm anywhere (a home box behind a proxy, Railway,
 * the live service), so the bearer token is the whole gate. Mounted as `/api/admin` on a single-farm server
 * (createApp) and `/api/f/:id/admin` on the multi-farm host (server/multi.js). `farmOf(req)` resolves the farm
 * context (or FarmHost) a request acts on, or null for 404.
 */
export function adminRouter(farmOf, { token, log = console } = {}) {
  const api = express.Router({ mergeParams: true });
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const m = typeof req.headers.authorization === 'string' ? /^Bearer\s+(\S+)$/i.exec(req.headers.authorization) : null;
    if (!m) return res.set('WWW-Authenticate', 'Bearer realm="harvest-hollow-admin"').status(401).json({ error: 'AUTH' });
    if (!sameSecret(m[1], token)) return res.status(403).json({ error: 'AUTH' });
    return next();
  });
  api.use(express.json({ limit: '4kb' }));
  // Top up a farm: { coins?, acorns?, xp?, pid?, pxp? }. One journaled `_grant` system action, so it survives a
  // replay on boot. `hh` is a FarmHost (server/farm-host.js) or a plain farm context, as in devRouter.
  api.post('/grant', async (req, res) => {
    const hh = await farmOf(req);
    if (!hh) return res.status(404).json({ error: 'not found' });
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const spec = {};
    for (const k of ['coins', 'acorns', 'xp', 'pxp']) {
      if (b[k] === undefined || b[k] === null) continue;
      if (!Number.isSafeInteger(b[k]) || b[k] <= 0) return res.status(400).json({ error: 'BAD_ARGS', field: k });
      spec[k] = b[k];
    }
    if (b.pid !== undefined && b.pid !== null) {
      if (typeof b.pid !== 'string') return res.status(400).json({ error: 'BAD_ARGS', field: 'pid' });
      spec.pid = b.pid;
    }
    if (!Object.keys(spec).length) return res.status(400).json({ error: 'BAD_ARGS', field: 'amount' });
    const call = (m, ...a) => (typeof hh.call === 'function' ? hh.call(m, ...a) : farmMethods(hh)[m](...a));
    let r;
    try { r = await call('grant', spec); } catch (err) {
      log.error('an admin grant failed', err);
      return res.status(500).json({ error: 'INTERNAL' });
    }
    if (!r || !r.ok) return res.status(400).json({ error: (r && r.code) || 'INTERNAL' });
    let snap = null;
    try { snap = await call('snapshot'); } catch { snap = null; }
    return res.json({ ok: true, wallet: snap ? snap.farm.wallet : null, xp: snap ? snap.farm.xp : null });
  });
  return api;
}

/**
 * Option 2's first-view hint: the high-use model families near every farmer's spawn on this farm (shared/net/packs-plan.js),
 * which a host page starts before the welcome: only families this farm reads at least SINGLE_SHARE of (the others load
 * file by file, the client's per-member rule) and the farmers' avatars. [] when anything is missing (the page then waits
 * for the welcome).
 */
export function firstPacksHint(hh) {
  try {
    const state = hh.engine.state;
    const points = Object.keys(state.players || {}).map((pid) => spawnAt(state, pid));
    const fileOf = modelFileOf(hh.static.modelManifest());
    const shares = packShares(state, fileOf, hh.static.packIndex().index);
    return firstViewPacks(state, points, fileOf).filter((id) => PREFETCHABLE.includes(id)
      && (id === 'models-avatars' || (shares[id] ?? 0) >= SINGLE_SHARE));
  } catch {
    return [];
  }
}

/** @param {object} hh  the server context ({ cfg, engine, sessions, clock, scheduler, persist, static? }) */
export function createApp(hh) {
  const { root } = hh.cfg;
  hh.static ??= new StaticFiles({ root, log: hh.log });
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  // option 2 (HH_ASSET_ORIGIN): the public host's build, checked now and every HH_ASSET_CHECK_MS; each page request
  // gets the host variant only when server/asset-origin.js says so, and a self page that may one day get it carries
  // the once-per-browser integrity probe
  const assets = hh.cfg.assets;
  if (assets?.origin && !hh.assetOrigin) {
    hh.assetOrigin = new AssetOrigin({ origin: assets.origin, probe: assets.probe, build: hh.static.build, everyMs: assets.checkMs,
      timeoutMs: assets.timeoutMs, log: hh.log });
    hh.assetOrigin.start();
  }
  app.use(hh.static.serveIndex((req) => {
    if (!hh.assetOrigin) return null;
    const base = hh.assetOrigin.baseFor(req);
    return { base, probe: true, hint: base ? firstPacksHint(hh) : null };
  }));
  app.use(hh.static.serveSriProbe());
  mountAssets(app, hh.static, root, { host: assets?.host !== false });

  app.get('/api/status', (_req, res) => res.json(status(hh)));

  if (hh.cfg.dev) app.use('/api/dev', devRouter(() => hh));
  // the owner's own top-up route (HH_ADMIN_TOKEN): the single-farm twin of /api/f/:id/admin on the multi host
  const adminToken = typeof hh.cfg.adminToken === 'string' ? hh.cfg.adminToken : (process.env.HH_ADMIN_TOKEN || '');
  if (adminToken.length >= MIN_ADMIN_TOKEN) {
    app.use('/api/admin', adminRouter(() => hh, { token: adminToken, log: hh.log }));
    hh.log?.info?.('admin: the grant route is on (HH_ADMIN_TOKEN is set)');
  } else if (adminToken) {
    hh.log?.warn?.(`HH_ADMIN_TOKEN is shorter than ${MIN_ADMIN_TOKEN} characters: the admin grant route stays off`);
  }
  // the in-game helper (Harness Hollow, server/harness): its REST base, the mod icons, the telemetry receiver
  if (hh.harness) {
    hh.harness.receiverRoutes(app);                // first: the agent's /api/harness/mock/... and loopback routes
    app.use('/api/harness', hh.harness.router);
    hh.harness.mountAssets(app);
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
  return app;
}
