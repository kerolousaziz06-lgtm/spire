// ingest/export_static.mjs — freeze the database into static files.
//
//   node ingest/dev  api.mjs        (running, with DATABASE_URL)
//   node ingest/export_static.mjs
//
// WHY STATIC. The figures come from quarterly filings and do not change
// between ingests, so serving them from a live database means paying a
// query, a connection and an outage risk on every page load for data that
// is frozen for three months. As files they are cached at the edge, cost
// nothing, need no credentials, and cannot be down.
//
// It also restores most of the property the project is built on: the
// browser fetches a static asset from its own origin, not a service.
//
// The export goes THROUGH the running API rather than re-reading the
// database, so the shape is produced by the same mapCompany.ts the live
// route uses. Reimplementing that mapping here is exactly the duplicated
// contract that keeping ingest/ in this repo was meant to avoid.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const API = process.env.API ?? 'http://127.0.0.1:3001';
const OUT = 'public/data/companies';

const list = await (await fetch(`${API}/api/tickers`)).json();
if (!Array.isArray(list.tickers) || list.tickers.length === 0) {
  console.error('no tickers from the API -- is dev:api running with DATABASE_URL?');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = [];
let bytes = 0, skipped = 0;

for (const { ticker } of list.tickers) {
  const res = await fetch(`${API}/api/company?ticker=${encodeURIComponent(ticker)}`);
  if (!res.ok) { console.error(`  ${ticker}: HTTP ${res.status}, skipped`); skipped++; continue; }
  const body = await res.json();

  // Only publish a company that will actually be useful. A payload with
  // almost nothing in it fills the sidebar with blanks and looks broken;
  // leaving it out means an honest "not loaded" instead.
  const filled = Object.values(body.input).filter((v) => v !== null).length;
  if (filled < 8) { console.error(`  ${ticker}: only ${filled} figures, skipped`); skipped++; continue; }

  const json = JSON.stringify(body);
  writeFileSync(`${OUT}/${ticker}.json`, json);
  bytes += json.length;
  index.push({ ticker, name: body.name, filled });
}

index.sort((a, b) => a.ticker.localeCompare(b.ticker));
const idx = JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  count: index.length,
  tickers: index.map(({ ticker, name }) => ({ ticker, name })),
});
writeFileSync(`${OUT}/index.json`, idx);

console.log(`${index.length} companies -> ${OUT}`);
console.log(`  ${(bytes / 1024).toFixed(0)} KB total, ${(bytes / index.length / 1024).toFixed(1)} KB each`);
console.log(`  index.json ${(idx.length / 1024).toFixed(1)} KB`);
if (skipped) console.log(`  ${skipped} skipped`);
