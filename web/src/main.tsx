import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { load, nx, save } from './lib/store';
import { Cloud, Profile, Inbox, AI } from './lib/cloud';
import { scheduleUpdateChecks } from './lib/update';

(async () => {
  await load();
  createRoot(document.getElementById('root')!).render(<App />);
  document.title = 'NEXORA';
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => null);
  if (Cloud.on()) {
    Cloud.sync().then(() => Profile.pull()).then(() => { AI.loadStatus(); Inbox.pump(); });
  }
  if (!nx.onboarded) { nx.onboarded = true; save(); }
  scheduleUpdateChecks();
})();
