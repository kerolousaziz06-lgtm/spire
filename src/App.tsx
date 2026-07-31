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
import { usePersistedState } from './lib/hooks';
import {
  STORAGE_KEYS,
  reviveHoldings,
  reviveNumericRecord,
} from './lib/persist';
import { ASSET_BY_ID, type Holding } from './lib/assets';
import { SAMPLE_INPUT, type CompanyInput } from './lib/analysis';
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

  useEffect(() => {
    document.body.classList.add('v2');
    return () => document.body.classList.remove('v2');
  }, []);

  function renderModule() {
    switch (activeModule) {
      case 'vantage':
        return (
          <Vantage
            input={company}
            onInput={setCompany}
            onResetInput={resetCompany}
          />
        );
      case 'stress':
      default:
        return (
          <StressTest
            holdings={holdings}
            onHoldings={setHoldings}
            onResetHoldings={resetHoldings}
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
