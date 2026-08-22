// ============================================================
// TickerFill.tsx — "fill this company from a ticker".
//
// Sits at the head of Vantage's sidebar. Typing a ticker replaces the
// figures below it; every field stays editable afterwards, so the
// input-driven design is unchanged -- it just starts populated.
//
// It reports what it could NOT fill as prominently as what it could. A
// blank field here is a deliberate withholding (a figure the filer
// stopped tagging, or one no filing contains), and saying so is what
// stops a user reading a blank as "the tool is broken".
// ============================================================
import { useEffect, useState } from 'react';
import { FIELD_LABELS, type CompanyInput } from '../lib/analysis';
import { fetchTicker, fetchLoadedTickers, scaleToDisplayUnits, type FetchedCompany, type LoadedTicker } from '../lib/tickerFetch';
import './TickerFill.css';

type Props = { onFill: (input: CompanyInput) => void };

export function TickerFill({ onFill }: Props) {
  const [ticker, setTicker] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [got, setGot] = useState<FetchedCompany | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loaded, setLoaded] = useState<LoadedTicker[]>([]);

  // Ask once what is available. Coverage is whatever the scheduled job has
  // ingested, and without this the field accepts anything and 404s on most
  // of it -- which reads as a broken tool rather than a partial database.
  useEffect(() => { fetchLoadedTickers().then(setLoaded); }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim() || busy) return;
    setBusy(true); setError(null); setGot(null); setShowDetail(false);
    const res = await fetchTicker(ticker);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    // Scale into the unit the sidebar is working in before handing it over.
    const scaled = scaleToDisplayUnits(res.company.input);
    setGot({ ...res.company, input: scaled });
    onFill(scaled);
  }

  const filled = got
    ? Object.values(got.input).filter((v) => v !== null).length
    : 0;
  const total = got ? Object.keys(got.input).length : 0;

  return (
    <div className="tf">
      <form className="tf-row" onSubmit={run}>
        <input
          className="tf-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="TICKER"
          aria-label="Ticker symbol"
          spellCheck={false}
          maxLength={10}
          list="tf-loaded"
          // Looking up a second company is the common case, and the field
          // keeps the previous ticker. Select on focus so typing replaces
          // it instead of appending -- otherwise AAPL + NVDA becomes
          // AAPLNVDA, which is a valid-looking ticker and a 404.
          onFocus={(e) => e.currentTarget.select()}
        />
        <datalist id="tf-loaded">
          {loaded.map((t) => (
            <option key={t.ticker} value={t.ticker}>{t.name}</option>
          ))}
        </datalist>
        <button className="tf-btn" type="submit" disabled={busy || !ticker.trim()}>
          {busy ? '…' : 'Fill'}
        </button>
      </form>

      {error && <p className="tf-error">{error}</p>}

      {loaded.length > 0 && !got && !error && (
        <p className="tf-avail">{loaded.length} companies loaded</p>
      )}

      {got && (
        <div className="tf-result">
          <p className="tf-name">{got.name}</p>
          <p className="tf-count">
            {filled} of {total} figures filled
            {got.blanked.length > 0 && (
              <button
                className="tf-more"
                onClick={() => setShowDetail((s) => !s)}
                aria-expanded={showDetail}
              >
                {got.blanked.length} withheld {showDetail ? '−' : '+'}
              </button>
            )}
          </p>

          {got.price && (
            <p className={`tf-price${got.price.ageDays > 7 ? ' tf-stale' : ''}`}>
              {/* Each clause is its own nowrap span: at this tracking the
                  line wraps, and it was splitting the date itself across
                  two lines ("as of 2026-08-" / "22"). */}
              <span>Price {got.price.value.toFixed(2)}</span>{' · '}
              <span>as of {got.price.asOf}</span>
              {got.price.ageDays > 0 && <>{' · '}<span>{got.price.ageDays}d old</span></>}
            </p>
          )}
          {!got.price && got.priceNote && (
            <p className="tf-price tf-stale">{got.priceNote}</p>
          )}

          {showDetail && (
            <ul className="tf-blanked">
              {got.blanked.map((b) => (
                <li key={b.field}>
                  <span className="tf-field">{FIELD_LABELS[b.field]}</span>
                  <span className="tf-reason">{b.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
