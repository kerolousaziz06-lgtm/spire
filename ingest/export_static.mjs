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

  // Only publish a company that will actually be useful. A payload of
  // mostly blanks fills the sidebar with nothing and reads as broken,
  // where its absence reads as an honest "not loaded".
  //
  // The test is the three figures every operating company files, NOT a
  // count. A count cannot tell a bank from a shell: JPMorgan legitimately
  // fills 9 of 18 -- no gross profit, no classified balance sheet, no
  // inventory -- while SEC's ticker map points XOM at a reorganisation
  // shell that also fills 9, with a balance sheet and NO INCOME STATEMENT
  // AT ALL. Requiring revenue, net income and total assets keeps every
  // real filer and drops the shell.
  // Requiring all three was too strict and dropped real filers: Broadcom,
  // Mastercard, Caterpillar and Xcel each miss ONE of them for ordinary
  // reasons, and a company at 9 of 18 is still useful -- JPMorgan sits
  // there legitimately and the UI names every blank.
  //
  // The shell's actual signature is having NO INCOME STATEMENT AT ALL.
  // SEC's ticker map points XOM at a reorganisation entity with a balance
  // sheet and neither revenue nor net income; a real company always has
  // at least one of the two.
  if (body.input.revenue === null && body.input.netIncome === null) {
    console.error(`  ${ticker}: no revenue AND no net income, skipped (shell or successor CIK)`);
    skipped++; continue;
  }
  if (body.input.totalAssets === null) {
    console.error(`  ${ticker}: no balance sheet, skipped`);
    skipped++; continue;
  }
  const filled = Object.values(body.input).filter((v) => v !== null).length;

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
