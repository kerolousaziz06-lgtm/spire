// ============================================================
// Vantage.tsx — the company-analysis module conductor.
//
// Holds the collapsible input sidebar and the analysis tabs
// (Health / Valuation / LBO / Summary). Same data underneath; each tab
// is a different lens.
//
// It does NOT own the company figures. Those are the user's data and
// live in App.tsx, above the point where this component unmounts on
// navigation. Entering a company takes about five minutes; losing it by
// clicking another module was not acceptable.
// ============================================================
import { useState } from 'react';
import { InputSidebar } from '../components/InputSidebar';
import { HealthTab } from './HealthTab';
import { ValuationTab } from './ValuationTab';
import { SummaryTab } from './SummaryTab';
import { LboTab } from './LboTab';
import { type CompanyInput } from '../lib/analysis';
import { PresetBar } from '../components/PresetBar';
import type { CompanyPreset } from '../lib/presets';
import './Vantage.css';

type Tab = 'health' | 'valuation' | 'lbo' | 'summary';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'health', label: 'Health', blurb: 'Is this a good business?' },
  { id: 'valuation', label: 'Valuation', blurb: 'Is it worth the price?' },
  { id: 'lbo', label: 'LBO', blurb: 'What could a PE firm make?' },
  { id: 'summary', label: 'Summary', blurb: 'The combined verdict' },
];

type Props = {
  input: CompanyInput;
  onInput: (next: CompanyInput) => void;
  onResetInput: () => void;
  // Saved companies live in App with the rest of the user's data, so they
  // survive navigating away from this module.
  presets: CompanyPreset[];
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  onRenamePreset: (id: string, name: string) => void;
};

export function Vantage({
  input, onInput, onResetInput,
  presets, onSavePreset, onDeletePreset, onRenamePreset,
}: Props) {
  const [tab, setTab] = useState<Tab>('health');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="vantage">
      <InputSidebar
        input={input}
        onChange={onInput}
        onReset={onResetInput}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div className="vantage-main">
        <header className="vantage-header">
          <div>
            <h1 className="vantage-title">Vantage</h1>
            <p className="vantage-subtitle">Company fundamentals & valuation — from the statements up</p>
          </div>
          <PresetBar
            presets={presets}
            input={input}
            onLoad={(p) => onInput(p.input)}
            onSave={onSavePreset}
            onDelete={onDeletePreset}
            onRename={onRenamePreset}
          />
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
