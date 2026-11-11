import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/ui';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { getSettings } from './lib/settings';

// Auto-update: check for a new version every minute and whenever the app comes back to the foreground.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { updateSW(true); },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    setInterval(() => reg.update().catch(() => {}), 60_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  },
});
document.documentElement.style.setProperty('--app-font', `'${getSettings().font}'`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
