// ============================================================
// App.tsx — the root. Now opens on the immersive Landing page;
// entering a module shows the Sidebar + that module. The 'v2'
// body class switches on the new sleek theme layer.
// ============================================================
import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { StressTest } from './modules/StressTest';
import { Vantage } from './modules/Vantage';
import { Landing } from './modules/Landing';
import './App.css';

export default function App() {
  const [activeModule, setActiveModule] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('v2');
    return () => document.body.classList.remove('v2');
  }, []);

  function renderModule() {
    switch (activeModule) {
      case 'stress': return <StressTest />;
      case 'vantage': return <Vantage />;
      default: return <StressTest />;
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
