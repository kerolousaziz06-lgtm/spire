// ============================================================
// App.tsx — the root. Opens on the immersive Landing page;
// entering a module shows the Sidebar + that module. The 'v2'
// body class switches on the theme layer.
//
// App also OWNS the user's data: the MonteVue portfolio and the
// Vantage company figures. That placement is deliberate and is half
// the fix for losing work. Modules unmount when you navigate away,
// so state held inside StressTest or Vantage dies with them and the
// user comes back to defaults. Held here, above the mount/unmount
// boundary, it survives navigation. usePersistedState then carries it
// across reloads too.
// ============================================================
import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { StressTest } from './modules/StressTest';
import { Vantage } from './modules/Vantage';
import { Landing } from './modules/Landing';
import { Settings } from './modules/Settings';
import { Mna, DEFAULT_MNA, type MnaState } from './modules/Mna';
import { usePersistedState } from './lib/hooks';
import {
  STORAGE_KEYS,
  clearAllPersisted,
  reviveHoldings,
  reviveNumericRecord,
} from './lib/persist';
import { DEFAULT_SETTINGS, reviveSettings, type Settings as SettingsType } from './lib/settings';
import { setDisplaySettings } from './lib/format';
import { ASSET_BY_ID, type Holding } from './lib/assets';
import { SAMPLE_INPUT, type CompanyInput } from './lib/analysis';
import {
  savePreset, deletePreset, renamePreset, makePresetsReviver,
  type CompanyPreset,
} from './lib/presets';
import './App.css';

// The portfolio the app starts with, and returns to on reset.
const INITIAL_HOLDINGS: Holding[] = [
  { assetId: 'us_stocks', dollars: 50000 },
  { assetId: 'nasdaq',    dollars: 20000 },
  { assetId: 'bonds',     dollars: 20000 },
  { assetId: 'cash',      dollars: 10000 },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<string | null>(null);

  const [holdings, setHoldings, resetHoldings] = usePersistedState<Holding[]>(
    STORAGE_KEYS.portfolio,
    INITIAL_HOLDINGS,
    (raw) => reviveHoldings<Holding>(raw, (id) => id in ASSET_BY_ID)
  );

  const [company, setCompany, resetCompany] = usePersistedState<CompanyInput>(
    STORAGE_KEYS.company,
    SAMPLE_INPUT,
    reviveNumericRecord
  );

  // Saved companies. Each stored input is run through the SAME numeric
  // reviver the live figures use, so a corrupt preset is dropped rather
  // than loaded into the engines.
  const [presets, setPresets, resetPresets] = usePersistedState<CompanyPreset[]>(
    STORAGE_KEYS.presets,
    [],
    makePresetsReviver(reviveNumericRecord, SAMPLE_INPUT)
  );

  // The deal. Revived shallowly: every field is a plain number, so the
  // shape check is "are the three blocks present with finite numbers".
  const [mna, setMna, resetMna] = usePersistedState<MnaState>(
    STORAGE_KEYS.mna,
    DEFAULT_MNA,
    (raw, fallback) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as MnaState;
      const okSide = (s: unknown) => {
        if (!s || typeof s !== 'object') return false;
        const c = (s as MnaState['acquirer']).company;
        return !!c && ['netIncome', 'sharesOutstanding', 'sharePrice']
          .every((k) => Number.isFinite((c as Record<string, number>)[k]));
      };
      if (!okSide(r.acquirer) || !okSide(r.target) || !r.deal) return null;
      const d = r.deal;
      const numeric = ['offerPricePerShare', 'pctStock', 'pctCash', 'pctDebt',
        'debtRate', 'cashRate', 'taxRate', 'synergies'] as const;
      if (!numeric.every((k) => Number.isFinite(d[k]))) return null;
      return { ...fallback, ...r };
    }
  );

  const [settings, setSettings, resetSettings] = usePersistedState<SettingsType>(
    STORAGE_KEYS.settings,
    DEFAULT_SETTINGS,
    reviveSettings
  );

  useEffect(() => {
    document.body.classList.add('v2');
    return () => document.body.classList.remove('v2');
  }, []);

  // Display settings are presentation-only, so format.ts holds them in a
  // module-level slot rather than being threaded through every call site.
  // Engine assumptions are threaded, because those CAN change a result.
  useEffect(() => { setDisplaySettings(settings.display); }, [settings.display]);

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', settings.display.reduceMotion);
  }, [settings.display.reduceMotion]);

  // Clearing everything has to reset the in-memory state too, or the app
  // would keep showing data it has just deleted and write it back on the
  // next edit.
  function clearAllData() {
    clearAllPersisted();
    resetHoldings();
    resetCompany();
    resetSettings();
    resetPresets();
    resetMna();
  }

  function renderModule() {
    switch (activeModule) {
      case 'vantage':
        return (
          <Vantage
            input={company}
            onInput={setCompany}
            onResetInput={resetCompany}
            presets={presets}
            onSavePreset={(name) => setPresets(savePreset(presets, name, company))}
            onDeletePreset={(id) => setPresets(deletePreset(presets, id))}
            onRenamePreset={(id, name) => setPresets(renamePreset(presets, id, name))}
          />
        );
      case 'mna':
        return (
          <Mna
            state={mna}
            onState={setMna}
            onReset={resetMna}
            presets={presets}
            currentCompany={company}
          />
        );
      case 'settings':
        return (
          <Settings
            settings={settings}
            onSettings={setSettings}
            onResetSettings={resetSettings}
            onClearAllData={clearAllData}
          />
        );
      case 'stress':
      default:
        return (
          <StressTest
            holdings={holdings}
            onHoldings={setHoldings}
            onResetHoldings={resetHoldings}
            assumptions={settings.assumptions}
          />
        );
    }
  }

  if (activeModule === null) {
    return <Landing onEnter={(m) => setActiveModule(m)} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={activeModule}
        onSelect={(id) => setActiveModule(id)}
        onHome={() => setActiveModule(null)}
      />
      <main className="app-content">{renderModule()}</main>
    </div>
  );
}
