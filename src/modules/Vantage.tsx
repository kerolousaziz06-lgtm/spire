// ============================================================
// Vantage.tsx — the company-analysis module conductor.
//
// Holds the ONE shared company input, the collapsible input
// sidebar, and the three analysis tabs (Health / Valuation /
// Summary). Same data underneath; each tab is a different lens.
// ============================================================
import { useState } from 'react';
import { InputSidebar } from '../components/InputSidebar';
import { HealthTab } from './HealthTab';
import { ValuationTab } from './ValuationTab';
import { SummaryTab } from './SummaryTab';
import { LboTab } from './LboTab';
import { SAMPLE_INPUT, type CompanyInput } from '../lib/analysis';
import './Vantage.css';

type Tab = 'health' | 'valuation' | 'lbo' | 'summary';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'health', label: 'Health', blurb: 'Is this a good business?' },
  { id: 'valuation', label: 'Valuation', blurb: 'Is it worth the price?' },
  { id: 'lbo', label: 'LBO', blurb: 'What could a PE firm make?' },
  { id: 'summary', label: 'Summary', blurb: 'The combined verdict' },
];

export function Vantage() {
  const [input, setInput] = useState<CompanyInput>(SAMPLE_INPUT);
  const [tab, setTab] = useState<Tab>('health');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="vantage">
      <InputSidebar
        input={input}
        onChange={setInput}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div className="vantage-main">
        <header className="vantage-header">
          <div>
            <h1 className="vantage-title">Vantage</h1>
            <p className="vantage-subtitle">Company fundamentals & valuation — from the statements up</p>
          </div>
        </header>

        {/* tab bar */}
        <div className="vantage-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`vantage-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="vantage-tab-label">{t.label}</span>
              <span className="vantage-tab-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>

        <div className="vantage-content">
          {tab === 'health' && <HealthTab input={input} />}
          {tab === 'valuation' && <ValuationTab input={input} />}
          {tab === 'lbo' && <LboTab input={input} />}
          {tab === 'summary' && <SummaryTab input={input} />}
        </div>
      </div>
    </div>
  );
}
