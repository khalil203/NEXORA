// NEXORA desktop: a native window around the hosted app, so it is always the
// latest version (same self-update channel as the phone) and works offline after
// the first launch (the web app's service worker caches it).
const { app, BrowserWindow, shell, session, Menu, nativeTheme } = require('electron');
const path = require('path');

const APP_URL = 'https://khalil203.github.io/NEXORA/';
const ORIGIN = new URL(APP_URL).origin;

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 560,
    title: 'NEXORA', backgroundColor: '#101626', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());

  // Links to other sites open in the normal browser; the app itself stays here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  // Microphone (voice capture, Jarvis), camera and clipboard for the NEXORA site only.
  const ok = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const from = details.requestingUrl || wc.getURL();
    cb(ok.has(perm) && (from.startsWith(ORIGIN) || from.startsWith('about:srcdoc')));
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
