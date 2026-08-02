// ============================================================
// presets.ts — saved companies.
//
// Entering a company takes about five minutes, and until now that work
// was worth exactly one company: typing a second one destroyed the first.
// A preset is a named snapshot of CompanyInput you can come back to.
//
// Pure functions over an immutable list. No React, no storage calls; the
// hook and the persistence live where they already do.
// ============================================================
import type { CompanyInput } from './analysis';

export type CompanyPreset = {
  id: string;
  name: string;
  savedAt: number;      // epoch ms, for "saved 3 days ago"
  input: CompanyInput;
};

// Bounded so a browser's storage quota is never the failure mode. The
// limit is generous relative to how long entry takes.
export const MAX_PRESETS = 24;

export const NAME_MAX = 40;

function makeId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Two inputs are "the same company" when every figure matches, including
// which ones are blank. Used to show whether what is on screen is still
// the saved preset or has unsaved edits.
export function sameInput(a: CompanyInput, b: CompanyInput): boolean {
  const keys = Object.keys(a) as (keyof CompanyInput)[];
  return keys.every((k) => a[k] === b[k]);
}

export function findMatching(presets: CompanyPreset[], input: CompanyInput): CompanyPreset | null {
  return presets.find((p) => sameInput(p.input, input)) ?? null;
}

export function findByName(presets: CompanyPreset[], name: string): CompanyPreset | null {
  const n = name.trim().toLowerCase();
  return presets.find((p) => p.name.trim().toLowerCase() === n) ?? null;
}

/**
 * Save under `name`. An existing name UPDATES that preset rather than
 * creating a duplicate: two entries called "Apple FY24" that differ would
 * be worse than useless.
 */
export function savePreset(
  presets: CompanyPreset[],
  name: string,
  input: CompanyInput
): CompanyPreset[] {
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) return presets;

  const existing = findByName(presets, clean);
  if (existing) {
    return presets.map((p) =>
      p.id === existing.id ? { ...p, name: clean, input: { ...input }, savedAt: Date.now() } : p
    );
  }

  const next: CompanyPreset = { id: makeId(), name: clean, savedAt: Date.now(), input: { ...input } };
  // Newest first, and drop the oldest past the cap.
  return [next, ...presets].slice(0, MAX_PRESETS);
}

export function deletePreset(presets: CompanyPreset[], id: string): CompanyPreset[] {
  return presets.filter((p) => p.id !== id);
}

export function renamePreset(presets: CompanyPreset[], id: string, name: string): CompanyPreset[] {
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) return presets;
  return presets.map((p) => (p.id === id ? { ...p, name: clean } : p));
}

// "just now" / "3 days ago". Small enough not to warrant a dependency.
export function savedAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Reviver for persist.ts. Every stored preset must carry a usable input,
 * so each one is run through the same numeric reviver the live company
 * figures use. A preset that fails is dropped rather than loaded, because
 * a half-valid company is exactly what reaches the engines and gets rated.
 */
export function makePresetsReviver(
  reviveInput: (raw: unknown, fallback: CompanyInput) => CompanyInput | null,
  sample: CompanyInput
) {
  return (raw: unknown): CompanyPreset[] | null => {
    if (!Array.isArray(raw)) return null;
    const out: CompanyPreset[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      if (typeof p.name !== 'string' || !p.name.trim()) continue;
      const input = reviveInput(p.input, sample);
      if (!input) continue;
      out.push({
        id: typeof p.id === 'string' && p.id ? p.id : makeId(),
        name: p.name.trim().slice(0, NAME_MAX),
        savedAt: typeof p.savedAt === 'number' && Number.isFinite(p.savedAt) ? p.savedAt : Date.now(),
        input,
      });
      if (out.length >= MAX_PRESETS) break;
    }
    return out;
  };
}
