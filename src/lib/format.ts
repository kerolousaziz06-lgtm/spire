// ============================================================
// format.ts — tiny helpers to display numbers nicely.
// Kept in one place so every part of the app formats money and
// percentages the same way.
//
// The display config below IS module-level mutable state, which this
// project otherwise avoids. The distinction is deliberate: these settings
// choose a currency glyph, a thousands separator and a unit suffix. They
// cannot change a computed value, only how it is written. Engine
// assumptions get threaded as arguments precisely because they CAN.
// ============================================================
import { DEFAULT_DISPLAY, UNIT_LOCALE, UNIT_SUFFIX, type DisplaySettings } from './settings';

let display: DisplaySettings = DEFAULT_DISPLAY;

export function setDisplaySettings(next: DisplaySettings): void {
  display = next;
}

// The unit suffix for statement-scale figures ("B", "M", "K"). This is a
// LABEL, not a conversion: the user enters figures in whatever unit they
// choose and the app never rescales them.
export function unitSuffix(): string {
  return UNIT_SUFFIX[display.units];
}

export function currencySymbol(): string {
  return display.currencySymbol;
}

const locale = () => UNIT_LOCALE[display.numberFormat];
const cur = () => display.currencySymbol;


// 142603.7  ->  "$142,604"   (whole dollars, with commas)
export function fmtMoney(n: number): string {
  return cur() + Math.round(n).toLocaleString(locale());
}

// 142603.7  ->  "$142.6k"  or  "$1.4M"  (compact, for tight chart labels)
export function fmtMoneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return cur() + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return cur() + Math.round(n / 1000) + 'k';
  return cur() + Math.round(n);
}

// 0.146  ->  "+14.6%"   (signed, one decimal)
export function fmtPctSigned(fraction: number): string {
  const pct = fraction * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

// 0.085  ->  "8.5%"     (unsigned)
export function fmtPct(fraction: number, decimals = 1): string {
  return (fraction * 100).toFixed(decimals) + '%';
}

// For editable money inputs: turn 100000 -> "100,000" for display.
export function fmtInputCommas(n: number): string {
  if (!isFinite(n) || n === 0) return '';
  return Math.round(n).toLocaleString(locale());
}

// ...and turn a typed string like "100,000" or "$100,000" back into 100000.
export function parseMoneyInput(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}
