// ============================================================
// main.tsx — the entry point. This is the very first code that
// runs. It loads the Inter font, imports the global theme, and
// "mounts" the App component into the <div id="root"> in index.html.
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';

// Load fonts: Inter (body), a display serif/sans for headlines, and a
// mono for the "terminal" number feel.
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
document.head.appendChild(fontLink);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
