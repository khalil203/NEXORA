import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { load, nx, save } from './lib/store';
import { Cloud, Profile, Inbox, AI } from './lib/cloud';
import { scheduleUpdateChecks } from './lib/update';
import './lib/install';
import { lock, shouldLockOnStart } from './lib/biometric';

(async () => {
  await load();
  if (shouldLockOnStart(Cloud.on())) lock.locked = true;
  createRoot(document.getElementById('root')!).render(<App />);
  // Launch screen: let the entrance play (≈1.4 s from first paint), then fade into the app.
  const started = (window as any).__nxLaunch || Date.now();
  setTimeout(() => {
    const el = document.getElementById('nx-launch'); if (!el) return;
    el.classList.add('out'); setTimeout(() => el.remove(), 550);
  }, Math.max(150, 1400 - (Date.now() - started)));
  document.title = 'NEXORA';
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => null);
  if (Cloud.on()) {
    Cloud.sync().then(() => Profile.pull()).then(() => { AI.loadStatus(); Inbox.pump(); });
  }
  if (!nx.onboarded) { nx.onboarded = true; save(); }
  scheduleUpdateChecks();
})();
