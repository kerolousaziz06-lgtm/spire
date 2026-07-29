// ============================================================
// InputSidebar.tsx — Vantage's collapsible data-entry column.
//
// Sits just right of the module rail. Holds ALL the company's raw
// numbers, grouped by statement (Income / Balance Sheet / Cash Flow
// / Market). Editable from any tab. Collapses to a thin strip to
// give the analysis room. One shared input feeds every tab.
// ============================================================
import { useState } from 'react';
import type { CompanyInput } from '../lib/analysis';
import './InputSidebar.css';

type Props = {
  input: CompanyInput;
  onChange: (next: CompanyInput) => void;
  collapsed: boolean;
  onToggle: () => void;
};

// Field groups mirror the real financial statements, so filling this
// in feels like reading down a 10-K.
const GROUPS: { title: string; fields: { key: keyof CompanyInput; label: string }[] }[] = [
  {
    title: 'Income Statement',
    fields: [
      { key: 'revenue', label: 'Revenue' },
      { key: 'grossProfit', label: 'Gross profit' },
      { key: 'operatingIncome', label: 'Operating income' },
      { key: 'netIncome', label: 'Net income' },
      { key: 'interestExpense', label: 'Interest expense' },
    ],
  },
  {
    title: 'Balance Sheet',
    fields: [
      { key: 'totalAssets', label: 'Total assets' },
      { key: 'currentAssets', label: 'Current assets' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'cash', label: 'Cash & equivalents' },
      { key: 'totalLiabilities', label: 'Total liabilities' },
      { key: 'currentLiabilities', label: 'Current liabilities' },
      { key: 'totalDebt', label: 'Total debt' },
      { key: 'shareholdersEquity', label: "Shareholders' equity" },
    ],
  },
  {
    title: 'Cash Flow',
    fields: [
      { key: 'operatingCashFlow', label: 'Operating cash flow' },
      { key: 'capex', label: 'Capital expenditures' },
    ],
  },
  {
    title: 'Market',
    fields: [
      { key: 'sharesOutstanding', label: 'Shares outstanding' },
      { key: 'sharePrice', label: 'Share price' },
    ],
  },
];

export function InputSidebar({ input, onChange, collapsed, onToggle }: Props) {
  const [group, setGroup] = useState(0); // which statement group is open

  function setField(key: keyof CompanyInput, raw: string) {
    const n = parseFloat(raw);
    onChange({ ...input, [key]: isFinite(n) ? n : 0 });
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
        {GROUPS[group].fields.map(({ key, label }) => (
          <label className="isb-field" key={key}>
            <span className="isb-label">{label}</span>
            <input
              className="isb-input tabular"
              type="number"
              value={input[key]}
              onChange={(e) => setField(key, e.target.value)}
              step="any"
            />
          </label>
        ))}
      </div>

      <p className="isb-note">
        All figures in the same unit (e.g. billions). Values flow into every tab.
      </p>
    </aside>
  );
}
