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

const PREFIX = 'finance-suite';

export const STORAGE_KEYS = {
  portfolio: `${PREFIX}:montevue.portfolio`,
  company: `${PREFIX}:vantage.company`,
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
export function reviveNumericRecord<T extends Record<string, number>>(
  raw: unknown,
  fallback: T
): T | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof T)[]) {
    const v = src[key as string];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v as T[keyof T];
    // else: keep the fallback's value for this key
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
