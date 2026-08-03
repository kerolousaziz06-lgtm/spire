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
    fields: ['operatingCashFlow', 'capex'],
  },
  {
    title: 'Market',
    fields: ['sharesOutstanding', 'sharePrice'],
  },
];

export function InputSidebar({ input, onChange, onReset, collapsed, onToggle }: Props) {
  const [group, setGroup] = useState(0); // which statement group is open

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
    const trimmed = raw.trim();
    if (trimmed === '') { onChange({ ...input, [key]: null }); return; }
    const n = parseFloat(trimmed);
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
              <input
                className={`isb-input tabular ${blank && !optional ? 'is-blank' : ''} ${flag ? 'is-' + flag.severity : ''}`}
                type="number"
                value={input[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                step="any"
                placeholder={optional ? '\u2014' : 'required'}
                aria-describedby={`hint-${key}`}
              />
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
