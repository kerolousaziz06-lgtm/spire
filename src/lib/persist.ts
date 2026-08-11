// ============================================================
// persist.ts — versioned localStorage, with no way to poison the math.
//
// There is no server, so "remembering what the user typed" means
// localStorage. The risk is not storage failing; it is storage
// SUCCEEDING with stale or malformed data that then flows into the
// engines. A missing field read back as `undefined` becomes NaN a few
// multiplications later, and Vantage would happily rate it STRONG.
//
// So every read is defended three ways:
//   1. a schema version — bump it and old payloads are discarded
//   2. try/catch around parse — corrupt JSON falls back, never throws
//   3. a per-call `revive` that must vouch for the shape, or reject
//
// Pure functions, no React. The hook that uses these lives in hooks.ts.
// ============================================================

// Bump this whenever a persisted shape changes: add a field to
// CompanyInput, change what a Holding looks like, anything. Old payloads
// are then thrown away instead of being read back half-populated.
export const SCHEMA_VERSION = 1;

const PREFIX = 'spire';

// The app was called "Finance Suite" until the name settled. The prefix
// is invisible to the user, but it is half of every storage key, so
// renaming it without moving the data would silently orphan every saved
// portfolio, company, preset, deal and budget — the app would come back
// looking like a fresh install with the old data still sitting in the
// browser, unreachable.
const LEGACY_PREFIX = 'finance-suite';

/**
 * Move anything written under the old prefix across, once. Runs at module
 * load, before any read.
 *
 * Keys are collected BEFORE anything is removed: mutating localStorage
 * while walking it by index reshuffles the indices and silently skips
 * entries. A newer value under the new prefix always wins, so running
 * this twice cannot overwrite current data with stale data.
 */
function migrateLegacyKeys(): void {
  const store = storage();
  if (!store) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(`${LEGACY_PREFIX}:`)) stale.push(k);
    }
    for (const k of stale) {
      const target = `${PREFIX}${k.slice(LEGACY_PREFIX.length)}`;
      const value = store.getItem(k);
      if (value !== null && store.getItem(target) === null) store.setItem(target, value);
      store.removeItem(k);
    }
  } catch {
    // Quota, private mode, a hostile value. A failed migration must never
    // stop the app loading; the worst case is the defaults.
  }
}

export const STORAGE_KEYS = {
  portfolio: `${PREFIX}:montevue.portfolio`,
  company: `${PREFIX}:vantage.company`,
  settings: `${PREFIX}:settings`,
  presets: `${PREFIX}:vantage.presets`,
  mna: `${PREFIX}:mna.deal`,
  budget: `${PREFIX}:ledger.budget`,
} as const;

type Envelope = { version: number; data: unknown };

// localStorage throws in Safari private mode and when the quota is full.
// Persistence is a convenience, so every failure here is non-fatal.
function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

migrateLegacyKeys();

/**
 * Read a persisted value, or return `fallback`.
 *
 * `revive` is the important argument: it receives the raw parsed value and
 * must return a fully-formed T, or null to reject it. Rejecting falls back
 * to the default. Never hand raw parsed JSON straight to the engines.
 */
export function loadPersisted<T>(
  key: string,
  fallback: T,
  revive: (raw: unknown, fallback: T) => T | null
): T {
  const store = storage();
  if (!store) return fallback;

  try {
    const text = store.getItem(key);
    if (!text) return fallback;

    const parsed = JSON.parse(text) as Envelope;
    if (!parsed || typeof parsed !== 'object') return fallback;
    if (parsed.version !== SCHEMA_VERSION) {
      // Stale shape from an older build. Drop it rather than read it.
      store.removeItem(key);
      return fallback;
    }

    const revived = revive(parsed.data, fallback);
    return revived ?? fallback;
  } catch {
    // Corrupt JSON, a hostile value, a storage error. Any of these mean
    // "show the sample", never "crash on load".
    return fallback;
  }
}

export function savePersisted<T>(key: string, data: T): void {
  const store = storage();
  if (!store) return;
  try {
    const envelope: Envelope = { version: SCHEMA_VERSION, data };
    store.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or private mode. Losing persistence beats breaking
    // the app the user is currently typing into.
  }
}

// Wipe everything this app stored. Used by Settings -> Data.
export function clearAllPersisted(): void {
  for (const key of Object.values(STORAGE_KEYS)) clearPersisted(key);
}

export function clearPersisted(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}

// ---- Revivers -------------------------------------------------------
// Each one proves the stored value is usable before the engines see it.

/**
 * Company figures. Every key present on the default must come back as a
 * finite number. Merging over the fallback means a field added later is
 * filled from the sample rather than arriving as `undefined`, which is a
 * second line of defence behind the version bump.
 */
export function reviveNumericRecord<T extends Record<string, number | null>>(
  raw: unknown,
  fallback: T
): T | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof T)[]) {
    const k = key as string;
    if (!(k in src)) {
      // The key did not exist when this was saved, which happens the first
      // time a field is added. Treat it as NOT PROVIDED rather than
      // inheriting the sample's value: quietly attaching the sample
      // company's figure to the user's company is the confidently-wrong
      // failure this codebase keeps hitting. Blank is honest, and the
      // metrics that need it skip themselves.
      out[key] = null as T[keyof T];
      continue;
    }
    const v = src[k];
    // null is a real stored value: the user deliberately cleared it.
    // Present but unusable (a string, NaN) keeps the fallback.
    if (v === null) out[key] = null as T[keyof T];
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v as T[keyof T];
  }
  return out;
}

/**
 * Portfolio holdings. Rejects anything that is not a list of known asset
 * ids with finite, non-negative dollar amounts. `isKnownAsset` is passed
 * in so this file needs no dependency on the asset universe.
 */
export function reviveHoldings<H extends { assetId: string; dollars: number }>(
  raw: unknown,
  isKnownAsset: (id: string) => boolean
): H[] | null {
  if (!Array.isArray(raw)) return null;
  const out: H[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { assetId, dollars } = item as { assetId?: unknown; dollars?: unknown };
    if (typeof assetId !== 'string' || !isKnownAsset(assetId)) return null;
    if (typeof dollars !== 'number' || !Number.isFinite(dollars) || dollars < 0) return null;
    out.push({ assetId, dollars } as H);
  }
  return out;
}
