// Applies the recommended Tabby settings for tabby-groups through Tabby's own ConfigService, while Tabby runs
// (never by editing config.yaml, which Tabby would overwrite):
//   node tabby-setup.mjs [--port 9222] [--dry-run]
// Each setting changes only while it still has Tabby's default (or an unusable value); a choice the user made stays.
// Prints one line per setting, "name: before → after" or "name: value (kept)". Exit 0 when done (or nothing to do),
// 2 when the DevTools port is closed (the manual steps are printed instead), 1 on any other error.
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const port = opt('port', '9222');
const dryRun = args.includes('--dry-run');

const MANUAL = `Tabby is not running with --remote-debugging-port=${port}. Set these by hand in Tabby's Settings:
  - Window → Tabs → Tabs location: Left (or Right)
  - Profiles & connections → Default profile: ${process.platform === 'win32' ? 'PowerShell Core (PowerShell 7)' : 'zsh'}
  - Color scheme: deep (only if it is still "Tabby Default")
  - Appearance → Custom CSS: add  .activity-indicator { display: none !important; }`;

let page;
try {
  page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
} catch { }
if (!page) { console.log(MANUAL); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', () => { console.log(MANUAL); process.exit(2); }, { once: true }); });

// Runs inside Tabby; returns the report lines.
const apply = async (dryRun) => {
  const { ɵgetLContext } = require('@angular/core');
  const core = require('tabby-core'), terminal = require('tabby-terminal');
  const injector = ɵgetLContext(document.querySelector('app-root')).lView[9];
  const cfg = injector.get(core.ConfigService);
  const s = cfg.store, d = cfg.getDefaults();
  const lines = [];
  let changed = false;
  const set = (name, before, after, write) => {
    if (after === undefined || after === before) { lines.push(`${name}: ${before} (kept)`); return; }
    lines.push(`${name}: ${before} → ${after}${dryRun ? ' (dry run)' : ''}`);
    if (!dryRun) { write(); changed = true; }
  };

  const tabs = s.appearance.tabsLocation;
  set('tabs location', tabs, ['left', 'right'].includes(tabs) ? tabs : 'left', () => { s.appearance.tabsLocation = 'left'; });

  // PowerShell 7 on Windows, zsh on macOS, if that profile exists; only while the default is still Tabby's own.
  const want = (await injector.get(core.ProfilesService).getProfiles()).find((p) => p.type === 'local' && (process.platform === 'win32'
    ? p.id === 'local:powershell-core' : /(^|\/)zsh$/.test(p.options?.command ?? '')));
  const profile = s.terminal.profile;
  set('default profile', profile, profile && profile !== d.terminal.profile ? profile : want?.id ?? profile, () => { s.terminal.profile = want.id; });

  const scheme = s.terminal.colorScheme?.name;
  const deep = scheme === d.terminal.colorScheme.name
    ? (await Promise.all(injector.get(terminal.TerminalColorSchemeProvider).map((p) => p.getSchemes()))).flat().find((x) => x.name === 'deep')
    : null;
  set('color scheme', scheme, deep?.name ?? scheme, () => { s.terminal.colorScheme = { ...deep }; });

  const RULE = '.activity-indicator { display: none !important; }';
  const css = s.appearance.css ?? '';
  const hasRule = /\.activity-indicator\s*\{[^}]*display:\s*none/.test(css);
  set('custom CSS', hasRule ? 'hides the activity indicator' : 'no activity-indicator rule', hasRule ? undefined : 'hides the activity indicator',
    () => { s.appearance.css = (css.trimEnd() ? css.trimEnd() + '\n' : '') + RULE; });

  if (changed) await cfg.save();
  return { lines, saved: changed };
};

const expression = `(${apply})(${dryRun})`;
const r = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});
if (!r.result || r.result.exceptionDetails) {
  console.error('tabby-setup: ' + (r.result?.exceptionDetails?.exception?.description ?? r.error?.message ?? 'no answer').split('\n')[0]);
  process.exit(1);
}
const { lines, saved } = r.result.result.value;
lines.forEach((l) => console.log(l));
console.log(dryRun ? 'Dry run: nothing saved.' : saved ? 'Saved through Tabby.' : 'Nothing to change.');
process.exit(0);
