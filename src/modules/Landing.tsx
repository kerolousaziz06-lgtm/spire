// ============================================================
// Landing.tsx — editorial suite home, dark edition.
//
// Giant wordmark ABOVE a square map image; the image carries a
// circular focus-lens (sharp center, blurred surround). Dark
// background, all text light-on-dark, editorial marginalia.
// ============================================================
import { WallStreetMap } from '../components/WallStreetMap';
import { useReveal } from '../lib/hooks';
import './Landing.css';

type Props = { onEnter: (module: string) => void; suiteName?: string };

export function Landing({ onEnter, suiteName = 'SUITE' }: Props) {
  return (
    <div className="ed">
      <div className="ed-topbar">
        <span>EST. 2026</span>
        <span>NEW YORK</span>
        <span>FINANCIAL ANALYSIS</span>
      </div>

      <section className="ed-hero">
        {/* marginalia */}
        <span className="ed-margin ed-margin--l">TRADE</span>
        <span className="ed-margin ed-margin--r">RISK</span>
        <span className="ed-margin ed-margin--tl">40.7069° N</span>
        <span className="ed-margin ed-margin--tr">74.0113° W</span>
        <span className="ed-margin ed-margin--bl">VALUATION</span>
        <span className="ed-margin ed-margin--br">NYSE</span>

        {/* word + framed map, overlapped; the word has a circular
            cutout where the lens sits, so the lens "eats" the letters */}
        <div className="ed-stage">
          <h1 className="ed-word">{suiteName}</h1>
          <div className="ed-frame">
            <WallStreetMap />
            <div className="ed-frame-caption">
              <span>WALL STREET</span>
              <span>—</span>
              <span>DOWNTOWN MANHATTAN</span>
            </div>
          </div>
        </div>

        <p className="ed-tagline">Portfolio risk &amp; company valuation.</p>
      </section>

      <section className="ed-modules">
        <ModuleCard index={0} num="01" name="MonteVue" kind="PORTFOLIO RISK"
          desc="Simulate thousands of futures. Replay real crashes. Map the frontier."
          onEnter={() => onEnter('stress')} />
        <ModuleCard index={1} num="02" name="Vantage" kind="COMPANY ANALYSIS"
          desc="Statements in. Health, valuation, and a verdict out."
          onEnter={() => onEnter('vantage')} />
      </section>

      <footer className="ed-footer">
        <span>{suiteName}</span>
        <span>©{new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

function ModuleCard({ index, num, name, kind, desc, onEnter }:
  { index: number; num: string; name: string; kind: string; desc: string; onEnter: () => void }) {
  const { ref, visible } = useReveal<HTMLButtonElement>();
  return (
    <button ref={ref} className={`ed-module reveal ${visible ? 'is-visible' : ''}`}
      style={{ animationDelay: `${index * 120}ms` }} onClick={onEnter}>
      <div className="ed-module-num">{num}</div>
      <div className="ed-module-body">
        <div className="ed-module-kind">{kind}</div>
        <div className="ed-module-name">{name}</div>
        <p className="ed-module-desc">{desc}</p>
      </div>
      <div className="ed-module-arrow">→</div>
    </button>
  );
}
