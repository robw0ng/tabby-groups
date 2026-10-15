// Drives Tabby's tab groups through its DevTools port (Tabby started with --remote-debugging-port=<port>).
//   node tabby.mjs open --group <g> --name <n> --dir <folder> --file <launch.ps1|launch.sh> [--app claude|codex|shell] [--port 9222]
//   node tabby.mjs open --group <g> --name <n> --dir <folder> [--run "<command>"] [--parent <p>] [--port 9222]
//   node tabby.mjs list [--port 9222]
//   node tabby.mjs move --tab <number|title> (--group <g> [--parent <p>] | --none) [--port 9222]
// Prints one JSON line. Exit 2 when the port is closed (a launcher can fall back), 1 on any other error.
// With the tabby-groups Tabby plugin (window.__tabbyGroups, v1+): real collapsible groups. Without it: `open --file` keeps a
// group's tabs side by side in one colour; --run and move need the plugin.
// --app claude|codex: the app names its own tab (Claude Code shows "✳ <session name>"), so no fixed title is kept;
// --app shell keeps the short title. This never splits panes.
// It drives Tabby's own Angular services (AppService, ProfilesService), an internal API: re-test after a Tabby update.
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const port = opt('port', '9222');

if (!['open', 'list', 'move'].includes(cmd)) {
  console.error('tabby: usage: node tabby.mjs open|list|move … (see the top of this file)');
  process.exit(1);
}
let page;
try {
  page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
} catch {
  console.error(`tabby: no DevTools port ${port} — start Tabby with --remote-debugging-port=${port}`);
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const evaluate = (expression) => new Promise((resolve) => {
  ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

// Runs inside Tabby. Without the plugin, a tab's group is a tag set at open; a tab without one (Tabby reloaded) falls back to its colour.
const inTabby = (fn, input) => `(async () => {
  const { ɵgetLContext } = require('@angular/core');
  const core = require('tabby-core');
  const lv = ɵgetLContext(document.querySelector('app-root')).lView;
  const app = lv[8].app, profiles = lv[9].get(core.ProfilesService);
  const groupOf = (t) => t.__workflowGroup ?? null;
  return (${fn})(app, profiles, groupOf, ${JSON.stringify(input)});
})()`;

const open = async (app, profiles, groupOf, o) => {
  const tg = window.__tabbyGroups;
  if (!o.file) {
    if (!(tg?.version >= 1)) throw new Error('open without --file needs the tabby-groups Tabby plugin');
    // The plugin's open uses Tabby's default profile and types --run once the shell is ready.
    const n = await tg.open({ title: o.name, cwd: o.dir, run: o.run, group: o.group, ...o.parent ? { parent: o.parent } : {} });
    const g = tg.list().find((x) => x.name === o.group);
    return { tab: o.name, group: o.group, color: g?.color, index: n - 1, groupSize: g?.tabs.length, plugin: true };
  }
  const palette = ['#f2756a', '#8ef58a', '#fdffad', '#86b7f7', '#f48cf6', '#d7cff9']; // the tabby-groups plugin's palette
  let h = 0; for (const c of o.group) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // A new subgroup never takes its parent's colour, or the two panels melt into one.
  const parentColor = o.parent ? window.__tabbyGroups?.list().find((g) => g.name === o.parent)?.color : null;
  const color = palette[h % palette.length] === parentColor ? palette[(h + 1) % palette.length] : palette[h % palette.length];
  const mine = app.tabs.filter((t) => groupOf(t) === o.group || (!groupOf(t) && t.color === color));
  // A .ps1 launch script runs in PowerShell 7, by the full path Tabby found for its own profile (so Tabby's PATH does not
  // matter); any other launch script is sourced in the default profile's shell (zsh or bash on macOS and Linux).
  const ps1 = /\.ps1$/i.test(o.file);
  const pwsh = (await profiles.getProfiles()).find((p) => p.id === 'local:powershell-core')?.options?.command
    ?? (process.platform === 'win32' ? 'pwsh.exe' : 'pwsh');
  const ownTitle = o.app === 'claude' || o.app === 'codex';
  if (tg?.version >= 1) {
    // The launch script is typed into a plain shell, not passed as -File: Tabby saves a tab's command line, so a -File tab
    // would run its launch script again after a restart and start a new session. The plugin resumes the session instead.
    // The name is set while the tab is filed (the plugin puts the tab whose title equals the group first).
    const exists = tg.list().some((g) => g.name === o.group);
    const shell = ps1
      ? { command: pwsh, args: ['-NoLogo'], run: `& '${o.file.replace(/'/g, "''")}'` }
      : { run: `. '${o.file.replace(/'/g, "'\\''")}'` };
    const n = await tg.open({ title: o.name, cwd: o.dir, ...shell, group: o.group, ...exists ? {} : { color }, ...o.parent ? { parent: o.parent } : {} });
    const tab = app.tabs[n - 1];
    if (ownTitle) tab.setCustomTitle(''); // hand the title back to the app
    const g = tg.list().find((x) => x.name === o.group);
    return { tab: o.name, group: o.group, color: g.color, index: app.tabs.indexOf(tab), groupSize: g.tabs.length, plugin: true };
  }
  if (!ps1) throw new Error('a launch script other than .ps1 needs the tabby-groups Tabby plugin');
  const profile = { type: 'local', name: o.name, options: { command: pwsh, args: ['-NoLogo', '-NoExit', '-File', o.file], cwd: o.dir, env: {} } };
  const inner = await profiles.openNewTabForProfile(profile);
  const tab = app.getParentTab(inner) ?? inner; // the call returns the terminal; the tab bar holds its wrapper
  tab.setCustomTitle(o.name);
  tab.color = color;
  tab.__workflowGroup = o.group;
  if (ownTitle) tab.setCustomTitle('');
  // Keep the group together: the run's own tab (name = run) leads it, every other tab goes after its last tab.
  // A new group goes to the end, where Tabby put it.
  if (mine.length) {
    const at = o.name === o.group ? app.tabs.indexOf(mine[0]) : app.tabs.indexOf(mine[mine.length - 1]) + 1;
    app.moveTabToIndex(tab, at);
  }
  return { tab: tab.customTitle, color, index: app.tabs.indexOf(tab), groupSize: mine.length + 1 };
};

const list = async (app, profiles, groupOf) =>
  window.__tabbyGroups?.version >= 1 ? { plugin: true, groups: window.__tabbyGroups.list() } : app.tabs.map((t, i) => ({ index: i, group: groupOf(t), title: t.customTitle || t.title, color: t.color }));

// --tab is the 1-based number the side bar shows, or a title: exact first, then one unique case-insensitive match.
const move = async (app, profiles, groupOf, o) => {
  const tg = window.__tabbyGroups;
  if (!(tg?.version >= 1)) throw new Error('move needs the tabby-groups Tabby plugin');
  const title = (t) => t.customTitle || t.title || '';
  let tab = /^\d+$/.test(o.tab) ? app.tabs[+o.tab - 1] : app.tabs.find((t) => title(t) === o.tab);
  if (!tab && !/^\d+$/.test(o.tab)) {
    const hits = app.tabs.filter((t) => title(t).toLowerCase().includes(o.tab.toLowerCase()));
    if (hits.length > 1) throw new Error(`"${o.tab}" matches ${hits.length} tabs: ${hits.map(title).join(', ')}`);
    tab = hits[0];
  }
  if (!tab) throw new Error(`no tab "${o.tab}"`);
  if (o.none) tg.removeTab(tab);
  else tg.addTab(tab, o.group, o.parent ? { parent: o.parent } : {});
  return { tab: title(tab), group: tab.__tg ?? null, index: app.tabs.indexOf(tab) };
};

const input = { group: opt('group'), name: opt('name'), dir: opt('dir'), file: opt('file'), app: opt('app', 'shell'), run: opt('run'), parent: opt('parent'), tab: opt('tab'), none: flag('none') };
if (cmd === 'open' && (!input.group || !input.name)) { console.error('tabby: open needs --group and --name'); process.exit(1); }
if (cmd === 'move' && (!input.tab || (!input.group && !input.none))) { console.error('tabby: move needs --tab and --group or --none'); process.exit(1); }
const r = await evaluate(inTabby({ open, list, move }[cmd], input));
ws.close();
if (r.result?.exceptionDetails) {
  console.error('tabby: ' + (r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails)).split('\n')[0].replace(/^Error: /, ''));
  process.exit(1);
}
console.log(JSON.stringify(r.result.result.value));
