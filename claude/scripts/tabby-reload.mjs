// Reloads Tabby plugins in place, without restarting or reloading the Tabby window:
//   node tabby-reload.mjs [--port 9222] <plugin> [<plugin> …]      e.g. tabby-groups tabby-remote
// The contract (shared by tabby-groups and tabby-remote): plugin "tabby-x" exposes window.__tabbyX.reload(), which drops
// its own require cache and installs the files on disk again; install() disposes the old copy first. A plugin without
// reload(), or one whose reload throws, needs a Tabby restart. tabby-groups goes last, so it can report on the others.
// Prints one line per plugin. Exit 0 when all reloaded, 3 when some need a restart, 2 when the port is closed, 1 on error.
const args = process.argv.slice(2);
const port = (() => { const i = args.indexOf('--port'); return i >= 0 ? args.splice(i, 2)[1] : '9222'; })();
const names = args.filter((a) => !a.startsWith('--'));
if (!names.length) { console.error('tabby-reload: name the plugins to reload, e.g. tabby-groups tabby-remote'); process.exit(1); }

let page;
try {
  page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
} catch { }
if (!page) { console.error(`tabby-reload: no DevTools port ${port}; restart Tabby to load ${names.join(', ')}`); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', () => { console.error('tabby-reload: cannot connect'); process.exit(2); }, { once: true }); });

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
const r = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(${inTabby})(${JSON.stringify(names)})`, awaitPromise: true, returnByValue: true } }));
});
if (!r.result || r.result.exceptionDetails) {
  console.error('tabby-reload: ' + (r.result?.exceptionDetails?.exception?.description ?? r.error?.message ?? 'no answer').split('\n')[0]);
  process.exit(1);
}
const rows = r.result.result.value;
rows.forEach(([n, state]) => console.log(`${n}: ${state}`));
process.exit(rows.every(([, s]) => s === 'reloaded') ? 0 : 3);
