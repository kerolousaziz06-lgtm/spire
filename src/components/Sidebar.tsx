// ============================================================
// Sidebar.tsx — the slim left navigation rail.
// It shows the logo, a list of module icons, and highlights the
// active one. It reports clicks up to the parent via onSelect.
// (Future modules just add one entry to the NAV array below —
// this is the "platform that could grow" structure.)
// ============================================================
import { LogoMark, IconStress, IconMerge, IconValuation, IconFlow, IconSettings } from './Icons';
import './Sidebar.css';

// Each nav item: an id, a label (for the tooltip + accessibility),
// and which icon component to draw. "enabled: false" = coming soon.
const NAV = [
  { id: 'stress',    label: 'MonteVue',   Icon: IconStress,    enabled: true  },
  { id: 'vantage',   label: 'Vantage',    Icon: IconValuation, enabled: true  },
  { id: 'mna',       label: 'M&A',        Icon: IconMerge,     enabled: true  },
  { id: 'ledger',    label: 'Ledger',     Icon: IconFlow,      enabled: true  },
];

type SidebarProps = {
  active: string;                       // which module id is currently open
  onSelect: (id: string) => void;       // called when a nav item is clicked
  onHome?: () => void;                  // called when the logo is clicked
};

export function Sidebar({ active, onSelect, onHome }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <button className="sidebar-logo" onClick={onHome} aria-label="Home">
        <LogoMark size={28} />
      </button>

      <div className="sidebar-nav">
        {NAV.map(({ id, label, Icon, enabled }) => (
          <button
            key={id}
            className={`nav-item ${active === id ? 'is-active' : ''} ${enabled ? '' : 'is-disabled'}`}
            onClick={() => enabled && onSelect(id)}
            disabled={!enabled}
            aria-label={enabled ? label : `${label} (coming soon)`}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon size={20} />
            <span className="nav-tooltip">{enabled ? label : `${label} · soon`}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          className={`nav-item ${active === 'settings' ? 'is-active' : ''}`}
          onClick={() => onSelect('settings')}
          aria-label="Settings"
          aria-current={active === 'settings' ? 'page' : undefined}
        >
          <IconSettings size={20} />
          <span className="nav-tooltip">Settings</span>
        </button>
      </div>
    </nav>
  );
}
