// ============================================================
// InputSidebar.tsx — Vantage's collapsible data-entry column.
//
// Sits just right of the module rail. Holds ALL the company's raw
// numbers, grouped by statement (Income / Balance Sheet / Cash Flow
// / Market). Editable from any tab. Collapses to a thin strip to
// give the analysis room. One shared input feeds every tab.
// ============================================================
import { useState } from 'react';
import { FIELD_HINTS, FIELD_LABELS, OPTIONAL_FIELDS, reconcile, type CompanyInput, type CompanyField } from '../lib/analysis';
import { TickerFill } from './TickerFill';
import { fmtFieldValue, unitSuffix } from '../lib/format';
import './InputSidebar.css';

type Props = {
  input: CompanyInput;
  onChange: (next: CompanyInput) => void;
  // Clears the saved figures and restores the sample company. Once the
  // inputs persist, a half-filled company otherwise has no way back to a
  // working demo state.
  onReset: () => void;
  collapsed: boolean;
  onToggle: () => void;
};

// Field groups mirror the real financial statements, so filling this
// in feels like reading down a 10-K.
// Field groups mirror the real financial statements, so filling this
// in feels like reading down a 10-K. Labels and hints live in
// analysis.ts so the sidebar and the "missing data" notices agree.
const GROUPS: { title: string; fields: CompanyField[] }[] = [
  {
    title: 'Income Statement',
    fields: ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'interestExpense'],
  },
  {
    title: 'Balance Sheet',
    fields: ['totalAssets', 'currentAssets', 'inventory', 'cash',
             'totalLiabilities', 'currentLiabilities', 'totalDebt', 'shareholdersEquity'],
  },
  {
    title: 'Cash Flow',
    fields: ['operatingCashFlow', 'capex', 'depreciationAmortization'],
  },
  {
    title: 'Market',
    fields: ['sharesOutstanding', 'sharePrice'],
  },
];

export function InputSidebar({ input, onChange, onReset, collapsed, onToggle }: Props) {
  const [group, setGroup] = useState(0); // which statement group is open

  // The field being edited, holding the LITERAL keystrokes.
  //
  // Controlling the input with the parsed number instead looks simpler and
  // cannot work: "0." parses to 0, so the decimal point is discarded on the
  // next render and typing 0.045 yields 45. Intermediate states have to
  // survive, so the draft string is what the input shows while focused and
  // the parsed number is what flows to state alongside it.
  //
  // Formatting is display only and is never written back.
  const [editing, setEditing] = useState<{ key: CompanyField; draft: string } | null>(null);

  // Which fields take part in a failed check, and the first message for
  // each. Shown inline so the user is sent to the number to fix rather
  // than left to work it out from a summary elsewhere.
  const flagged = new Map<CompanyField, { severity: 'error' | 'caution'; message: string }>();
  for (const issue of reconcile(input)) {
    for (const f of issue.fields) {
      const existing = flagged.get(f);
      // An error outranks a caution on the same field.
      if (!existing || (existing.severity === 'caution' && issue.severity === 'error')) {
        flagged.set(f, { severity: issue.severity, message: issue.message });
      }
    }
  }

  // A cleared field becomes null, NOT 0. Coercing to 0 used to make
  // "I haven't found this yet" indistinguishable from "this is genuinely
  // zero", and every metric downstream was computed from the 0.
  function setField(key: CompanyField, raw: string) {
    // Strip grouping separators so a pasted "331,839" parses. Both
    // locales are handled: en-US groups with "," and de-DE with ".", so
    // the decimal mark is whichever separator appears LAST.
    const trimmed = raw.trim();
    if (trimmed === '') { onChange({ ...input, [key]: null }); return; }
    const lastComma = trimmed.lastIndexOf(',');
    const lastDot = trimmed.lastIndexOf('.');
    const decimalMark = lastComma > lastDot ? ',' : '.';
    const cleaned = trimmed
      .replace(decimalMark === ',' ? /\./g : /,/g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    onChange({ ...input, [key]: Number.isFinite(n) ? n : null });
  }

  if (collapsed) {
    return (
      <div className="isb isb--collapsed">
        <button className="isb-expand" onClick={onToggle} aria-label="Expand inputs">
          <span className="isb-expand-icon">›</span>
          <span className="isb-expand-text">Inputs</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="isb">
      <div className="isb-head">
        <div>
          <h2 className="isb-title">Company Data</h2>
          <p className="isb-sub">Enter figures from the filings</p>
        </div>
        <button className="isb-collapse" onClick={onToggle} aria-label="Collapse inputs">‹</button>
      </div>

      {/* Fill from a ticker. Above the groups because it replaces what is
          below it -- a control that overwrites should be seen before the
          thing it overwrites, not discovered after. Every field stays
          editable, so this is a starting point, not a lock. */}
      <TickerFill onFill={onChange} />

      {/* group tabs */}
      <div className="isb-groups">
        {GROUPS.map((g, i) => (
          <button
            key={g.title}
            className={`isb-group-tab ${group === i ? 'is-active' : ''}`}
            onClick={() => setGroup(i)}
          >
            {g.title.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="isb-fields">
        <div className="isb-group-title">{GROUPS[group].title}</div>
        {GROUPS[group].fields.map((key) => {
          const optional = OPTIONAL_FIELDS.has(key);
          const blank = input[key] === null;
          const flag = flagged.get(key);
          return (
            <label className="isb-field" key={key}>
              <span className="isb-label">
                {FIELD_LABELS[key]}
                {optional && <span className="isb-optional">optional</span>}
              </span>
              {/* type="text", not "number": a number input rejects the
                  separators outright, so grouping is impossible in one.
                  inputMode keeps the numeric keypad on touch. */}
              <input
                className={`isb-input tabular ${blank && !optional ? 'is-blank' : ''} ${flag ? 'is-' + flag.severity : ''}`}
                type="text"
                inputMode="decimal"
                value={
                  editing?.key === key
                    ? editing.draft
                    : (input[key] === null ? '' : fmtFieldValue(input[key] as number))
                }
                onFocus={(e) => {
                  // Swapping the string on focus re-renders and discards
                  // the browser's selection, so click-and-type landed
                  // inside the old value rather than replacing it.
                  // Re-select once the swap has painted.
                  const el = e.currentTarget;
                  setEditing({ key, draft: String(input[key] ?? '') });
                  requestAnimationFrame(() => el.select());
                }}
                onBlur={() => setEditing(null)}
                onChange={(e) => {
                  setEditing({ key, draft: e.target.value });
                  setField(key, e.target.value);
                }}
                placeholder={optional ? '\u2014' : 'required'}
                aria-describedby={`hint-${key}`}
              />
              {/* The unit these figures are in. Without it a bare 331,839
                  is ambiguous, and the app deliberately never converts
                  hand-typed figures -- so it has to say what it assumes. */}
              <span className="isb-unit" aria-hidden="true">{unitSuffix()}</span>
              {/* Where to find it on a filing. Several of these are not
                  single line items, which was the slowest part of entry. */}
              {flag
                ? <span className={`isb-flag isb-flag--${flag.severity}`} role="alert">{flag.message}</span>
                : <span className="isb-hint" id={`hint-${key}`}>{FIELD_HINTS[key]}</span>}
            </label>
          );
        })}
      </div>

      <div className="isb-foot">
        <button
          className="isb-reset"
          onClick={onReset}
          title="Discard your figures and restore the sample company"
        >
          Reset to sample
        </button>
        <p className="isb-note">
          All figures in the same unit (e.g. billions). Values flow into every tab.
        </p>
      </div>
    </aside>
  );
}
