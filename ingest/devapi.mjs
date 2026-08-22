// ingest/devapi.mjs — runs the api/ handlers locally so `npm run dev` can
// exercise the real routes. Not used in production; Vercel builds api/
// into functions itself.
//
//   DATABASE_URL=... node ingest/devapi.mjs
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('node_modules/.cache', { recursive: true });
const routes = {};
for (const name of ['company', 'peers', 'tickers']) {
  const out = `node_modules/.cache/api-${name}.mjs`;
  await build({
    entryPoints: [`api/${name}.ts`], bundle: true, platform: 'node',
    format: 'esm', outfile: out, external: ['pg'], logLevel: 'error',
  });
  routes[`/api/${name}`] = (await import(pathToFileURL(process.cwd() + '/' + out))).default;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = routes[url.pathname];
  if (!handler) { res.writeHead(404); return res.end('{}'); }
  const shim = {
    status(c) { res.statusCode = c; return this; },
    setHeader(k, v) { res.setHeader(k, v); return this; },
    json(body) { res.setHeader('content-type', 'application/json');
                 res.end(JSON.stringify(body)); },
  };
  try {
    await handler({ query: Object.fromEntries(url.searchParams) }, shim);
  } catch (e) {
    console.error(e); res.statusCode = 500; res.end('{"error":"dev handler threw"}');
  }
}).listen(3001, () => console.log('dev api on http://127.0.0.1:3001'));
