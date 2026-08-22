// ============================================================
// tickerFetch.ts — pull a company's figures from /api/company.
//
// SAME-ORIGIN ONLY. This is the app's own API route, not a third party:
// no key, no CORS, no external host. The "browser makes zero external
// requests" property is intact; what changed is that the app now has a
// backend of its own to ask.
//
// An API response is untrusted input, exactly like a localStorage
// payload, and gets the same treatment: a reviver that must vouch for
// the shape or reject it. A half-valid company reaching the engines and
// being confidently rated is the failure this codebase keeps hitting.
// ============================================================
import { SAMPLE_INPUT, type CompanyInput, type CompanyField } from './analysis';

export type FetchedCompany = {
  ticker: string;
  name: string;
  input: CompanyInput;
  /** Period each figure is as of, so the UI can show provenance. */
  asOf: Partial<Record<CompanyField, string>>;
  /** Figures the server deliberately withheld, with the reason. */
  blanked: { field: CompanyField; reason: string }[];
  price: { value: number; asOf: string; ageDays: number } | null;
  priceNote?: string;
};

const FIELDS = Object.keys(SAMPLE_INPUT) as CompanyField[];
const isField = (k: string): k is CompanyField => (FIELDS as string[]).includes(k);

/** Every field present and numeric-or-null, or null to reject the lot. */
export function reviveFetched(raw: unknown): FetchedCompany | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ticker !== 'string' || typeof r.name !== 'string') return null;
  if (!r.input || typeof r.input !== 'object') return null;

  const src = r.input as Record<string, unknown>;
  const input = {} as CompanyInput;
  for (const f of FIELDS) {
    const v = src[f];
    // Absent is treated as "not provided", never as the sample's value:
    // silently attaching sample figures to a real company is the exact
    // bug reviveNumericRecord was changed to avoid.
    if (v === null || v === undefined) input[f] = null;
    else if (typeof v === 'number' && Number.isFinite(v)) input[f] = v;
    else return null;                       // a string or NaN means broken
  }

  const meta = (r.meta ?? {}) as Record<string, unknown>;

  const asOf: Partial<Record<CompanyField, string>> = {};
  const rawAsOf = (meta.asOf ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawAsOf)) {
    if (isField(k) && typeof v === 'string') asOf[k] = v;
  }

  const blanked: FetchedCompany['blanked'] = [];
  if (Array.isArray(meta.blanked)) {
    for (const b of meta.blanked) {
      const o = b as Record<string, unknown>;
      if (typeof o?.field === 'string' && isField(o.field)
          && typeof o.reason === 'string') {
        blanked.push({ field: o.field, reason: o.reason });
      }
    }
  }

  let price: FetchedCompany['price'] = null;
  const p = meta.price as Record<string, unknown> | null | undefined;
  if (p && typeof p.value === 'number' && Number.isFinite(p.value)
      && typeof p.asOf === 'string' && typeof p.ageDays === 'number') {
    price = { value: p.value, asOf: p.asOf, ageDays: p.ageDays };
  }

  return {
    ticker: r.ticker, name: r.name, input, asOf, blanked, price,
    priceNote: typeof meta.priceNote === 'string' ? meta.priceNote : undefined,
  };
}

export type FetchResult =
  | { ok: true; company: FetchedCompany }
  | { ok: false; error: string };

export async function fetchTicker(ticker: string): Promise<FetchResult> {
  const t = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) {
    return { ok: false, error: 'That does not look like a ticker.' };
  }
  let res: Response;
  try {
    res = await fetch(`/api/company?ticker=${encodeURIComponent(t)}`);
  } catch {
    // Offline, or the API route is not deployed. Say so plainly rather
    // than leaving a spinner running -- the app still works by hand.
    return { ok: false, error: 'Could not reach the data service. Enter the figures by hand.' };
  }
  if (res.status === 404) {
    return { ok: false, error: `${t} is not in the database yet.` };
  }
  if (!res.ok) {
    return { ok: false, error: `Lookup failed (${res.status}).` };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'The data service returned something unreadable.' };
  }
  const company = reviveFetched(body);
  if (!company) {
    return { ok: false, error: 'The data service returned an unexpected shape.' };
  }
  return { ok: true, company };
}
