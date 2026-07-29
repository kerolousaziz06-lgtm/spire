// ============================================================
// TopBar.tsx — the header strip above the content.
// Title + subtitle on the left; the "simulations" pills on the
// right. The pills are now CONNECTED: clicking one changes how
// many futures the engine simulates. The value lives in the parent
// (StressTest), passed down via props — this is "lifting state up"
// so the number is shared with the simulation.
// ============================================================
import './TopBar.css';

const RANGES = [1000, 5000, 10000];

type Props = {
  title: string;
  subtitle: string;
  numPaths: number;
  onNumPaths: (n: number) => void;
};

export function TopBar({ title, subtitle, numPaths, onNumPaths }: Props) {
  return (
    <header className="topbar">
      <div>
        <h1 className="topbar-title">{title}</h1>
        <p className="topbar-subtitle">{subtitle}</p>
      </div>

      <div className="topbar-actions">
        <span className="pills-label">Simulations</span>
        <div className="pills" role="group" aria-label="Number of simulations">
          {RANGES.map((r) => (
            <button
              key={r}
              className={`pill ${numPaths === r ? 'is-active' : ''}`}
              onClick={() => onNumPaths(r)}
              aria-pressed={numPaths === r}
            >
              {r.toLocaleString()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
