// ============================================================
// SectorComps.tsx — this company's multiples against its sector.
//
// The sector BENCHMARK comes from SQL (sector_comps: PERCENTILE_CONT over
// every company in the sector). The company's OWN multiples come from
// multiples() on the live sidebar figures -- never from the stored export.
//
// That split is the point. Compare against stored figures and editing a
// field after filling would leave the comparison showing a number the
// analysis no longer uses: the heatmap bug, where the grid displayed raw
// correlations while the engine simulated with repaired ones.
//
// Works for hand-entered companies too. With no ticker there is no
// sector to infer, so the user picks one -- the input-driven design holds.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { multiples, type CompanyInput } from '../lib/analysis';
import { loadScreenerData } from '../lib/screenerData';
import type { SectorComp } from '../lib/screener';
import './SectorComps.css';

type Row = {
  label: string;
  mine: number | null;
  median: number | null;
  q1?: number | null;
  q3?: number | null;
};

const x = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(1) + '×');

/** Where a multiple sits against its sector, in words. A premium is not a
 *  verdict -- the market may be right to pay it -- so this says what the
 *  gap IS and leaves the judgement to the DCF below. */
function readGap(mine: number | null, median: number | null): { text: string; tone: string } | null {
  if (mine === null || median === null || median <= 0) return null;
  const gap = mine / median - 1;
  if (Math.abs(gap) < 0.1) return { text: 'in line with the sector', tone: 'ok' };
  const pct = Math.round(Math.abs(gap) * 100);
  return gap > 0
    ? { text: `${pct}% premium to the sector median`, tone: 'warn' }
    : { text: `${pct}% discount to the sector median`, tone: 'good' };
}

export function SectorComps({ input, ticker }: { input: CompanyInput; ticker: string | null }) {
  const [sectors, setSectors] = useState<SectorComp[]>([]);
  const [sectorOf, setSectorOf] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadScreenerData().then((d) => {
      if (d) {
        setSectors(d.sectors);
        setSectorOf(Object.fromEntries(
          d.rows.filter((r) => r.sector).map((r) => [r.ticker, r.sector as string])));
      }
      setReady(true);
    });
  }, []);

  // A filled ticker decides the sector; otherwise the user's pick does.
  const inferred = ticker ? sectorOf[ticker] ?? '' : '';
  const sector = inferred || picked;
  const comp = sectors.find((s) => s.sector === sector) ?? null;

  const rows: Row[] = useMemo(() => {
    const live = Object.fromEntries(multiples(input).map((m) => [m.key, m.value]));
    const mine = (k: string) => {
      const v = live[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    return [
      { label: 'EV / EBITDA', mine: mine('evEbitda'),
        median: comp?.ev_ebitda_median ?? null, q1: comp?.ev_ebitda_q1 ?? null, q3: comp?.ev_ebitda_q3 ?? null },
      { label: 'Price / earnings', mine: mine('pe'), median: comp?.pe_median ?? null },
      { label: 'Price / sales', mine: mine('ps'), median: comp?.ps_median ?? null },
    ];
  }, [input, comp]);

  // No published universe means no benchmark to show. Render nothing
  // rather than a card of dashes that reads as a broken feature.
  if (!ready || sectors.length === 0) return null;

  return (
    <div className="sc">
      <div className="sc-head">
        <h3 className="sc-title">Against its sector</h3>
        {inferred ? (
          <span className="sc-sector">{inferred} · {comp?.companies ?? 0} companies</span>
        ) : (
          <select
            className="sc-pick"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Compare against a sector"
          >
            <option value="">Choose a sector…</option>
            {sectors.map((s) => (
              <option key={s.sector} value={s.sector}>{s.sector} ({s.companies})</option>
            ))}
          </select>
        )}
      </div>

      {!comp ? (
        <p className="sc-note">
          {ticker && !inferred
            ? `${ticker} has no sector on file, so there is nothing to compare it against.`
            : 'Pick a sector to see where these multiples sit against real peers.'}
        </p>
      ) : (
        <>
          <table className="sc-table tabular">
            <thead>
              <tr><th></th><th>This company</th><th>Sector median</th><th>Middle half</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const g = readGap(r.mine, r.median);
                return (
                  <tr key={r.label}>
                    <td className="sc-lab">{r.label}</td>
                    <td>{x(r.mine)}</td>
                    <td>{x(r.median)}</td>
                    <td className="sc-range">
                      {r.q1 != null && r.q3 != null ? `${x(r.q1)} – ${x(r.q3)}` : '—'}
                    </td>
                    {g && <td className={`sc-gap sc-gap--${g.tone}`}>{g.text}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="sc-foot">
            Medians, not means: multiples are right-skewed, and one company on 90× would drag
            an average above anything its peers trade at.
            {comp.with_ev_ebitda < comp.companies &&
              ` EV/EBITDA from ${comp.with_ev_ebitda} of ${comp.companies} — the rest have no usable EBITDA.`}
          </p>
        </>
      )}
    </div>
  );
}
