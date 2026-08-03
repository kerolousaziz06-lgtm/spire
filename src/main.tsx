// ============================================================
// main.tsx — the entry point. Imports the global theme and mounts
// App into the <div id="root"> in index.html.
//
// This used to inject a <link> to fonts.googleapis.com at runtime,
// which meant the app fetched from a third party on every load and
// rendered in Times if that fetch failed. The typefaces are now bundled
// as @font-face in theme.css, so there is no external request at all.
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
