// Reloads Tabby plugins in place, without restarting or reloading the Tabby window:
//   node tabby-reload.mjs [--port 9222] <plugin> [<plugin> …]      e.g. tabby-groups tabby-remote
// The contract (shared by tabby-groups and tabby-remote): plugin "tabby-x" exposes window.__tabbyX.reload(), which drops
// its own require cache and installs the files on disk again; install() disposes the old copy first. A plugin without
// reload(), or one whose reload throws, needs a Tabby restart. tabby-groups goes last, so it can report on the others.
// Each Tabby window runs its own copy of every plugin, so it reloads in every window.
// Prints one line per plugin (per window when there are several). Exit 0 when all reloaded, 3 when some need a restart,
// 2 when the port is closed, 1 on error.
import { tabbyPages, evaluateIn } from './tabby-window.mjs';

const args = process.argv.slice(2);
const port = (() => { const i = args.indexOf('--port'); return i >= 0 ? args.splice(i, 2)[1] ?? '9222' : '9222'; })();
const names = args.filter((a) => !a.startsWith('--'));
if (!names.length) { console.error('tabby-reload: name the plugins to reload, e.g. tabby-groups tabby-remote'); process.exit(1); }

const pages = await tabbyPages(port);
if (!pages?.length) { console.error(`tabby-reload: no DevTools port ${port}; restart Tabby to load ${names.join(', ')}`); process.exit(2); }

const inTabby = async (names) => {
  const global = (n) => '__' + n.replace(/-(\w)/g, (m, c) => c.toUpperCase());
  const out = [];
  for (const n of [...names].sort((a, b) => (a === 'tabby-groups') - (b === 'tabby-groups'))) {
    const api = window[global(n)];
    if (typeof api?.reload !== 'function') { out.push([n, 'restart needed (no reload)']); continue; }
    try { await api.reload(); out.push([n, 'reloaded']); } catch (e) { out.push([n, 'restart needed (' + String(e?.message ?? e) + ')']); }
  }
  return out;
};
setTimeout(() => { console.error('tabby-reload: no answer in 60 s; restart Tabby if a plugin looks broken'); process.exit(1); }, 60000).unref();
const rows = [];
for (const [i, page] of pages.entries()) {
  const value = await evaluateIn(page, `(${inTabby})(${JSON.stringify(names)})`);
  if (!Array.isArray(value)) { console.error(`tabby-reload: no answer from window ${i + 1}`); process.exit(1); }
  for (const [n, state] of value) rows.push([pages.length > 1 ? `${n} (window ${i + 1})` : n, state]);
}
rows.forEach(([n, state]) => console.log(`${n}: ${state}`));
process.exit(rows.every(([, s]) => s === 'reloaded') ? 0 : 3);
