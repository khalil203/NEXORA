// Copies the single-file build to ../app.html and stamps the version where the
// existing loader (index.html) and the 5.x updater look for it: APP_VERSION = 'x.y.z'
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
let html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
html = html.replace('<head>', `<head>\n<script>var APP_VERSION = '${pkg.version}';</script>`);
if (!html.includes(`APP_VERSION = '${pkg.version}'`)) throw new Error('version stamp missing');
writeFileSync(new URL('../../app.html', import.meta.url), html);
const v = JSON.parse(readFileSync(new URL('../../version.json', import.meta.url)));
if (v.version !== pkg.version) console.warn(`⚠ version.json says ${v.version}, package.json says ${pkg.version}`);
console.log(`app.html written (${(html.length / 1024).toFixed(0)} KB), NEXORA ${pkg.version}`);
