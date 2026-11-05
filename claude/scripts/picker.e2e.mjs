// node picker.e2e.mjs --port <a test Tabby's DevTools port>: checks the new-tab picker end to end with real right-clicks.
// It closes every tab in that Tabby's first window, so never point it at your own Tabby. Tabs on the left or right.
import { tabbyPages } from './tabby-window.mjs';

const i = process.argv.indexOf('--port');
const port = i > 0 ? process.argv[i + 1] : null;
if (!port) {
  console.error('usage: node picker.e2e.mjs --port <port> (use a test Tabby, not your own)');
  process.exit(1);
}
const [page] = (await tabbyPages(port)) ?? [];
if (!page) {
  console.error(`picker.e2e: no DevTools port ${port}`);
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  ws.addEventListener('message', function on (e) {
    const m = JSON.parse(e.data);
    if (m.id !== n) return;
    ws.removeEventListener('message', on);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const run = async (fn, arg) => {
  const r = await call('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rightClick = async ({ x, y }) => {
  for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'right', buttons: type === 'mousePressed' ? 2 : 0, clickCount: 1 });
  await sleep(400);
};
const key = async (k, code) => {
  for (const type of ['rawKeyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key: k, code: code ?? k, windowsVirtualKeyCode: { Enter: 13, Escape: 27, ArrowDown: 40 }[k] });
  await sleep(300);
};
const APP = `require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[8].app`;
const state = () => run(`() => {
  const app = ${APP};
  return { picker: !!document.querySelector('.tg-picker'), rows: [...document.querySelectorAll('.tg-picker .tg-item')].map(e => e.lastChild.textContent),
    tabs: app.tabs.map(t => ({ title: t.customTitle || t.title, group: t.__tg ?? null })), menu: !!document.querySelector('.tg-menu:not(.tg-picker)') }
}`);
// Points in the side bar: a tab row, a group header, the inner group's footer, and the free space below the rows.
const points = () => run(`() => {
  const mid = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
  const list = document.querySelector('.tab-bar .tabs');
  const l = list.getBoundingClientRect();
  return { tab: mid(list.querySelector(':scope > tab-header')), header: mid(list.querySelector('.tg-header')),
    foot: mid(list.querySelector('.tg-foot[data-group="inner"]')), free: { x: l.left + l.width / 2, y: l.bottom + 30 } };
}`);

// Setup: a loose tab, then outer > inner with one tab each; the last row is in a group.
await run(`async () => {
  const app = ${APP};
  for (const t of [...app.tabs]) await app.closeTab(t, false, true);
  await window.__tabbyGroups.open({ title: 'loose' });
  await window.__tabbyGroups.open({ title: 'o1', group: 'outer' });
  await window.__tabbyGroups.open({ title: 'i1', group: 'inner', parent: 'outer' });
}`);
await sleep(1500);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
let p = await points();

const filterHeight = () => run(`() => document.querySelector('.tg-picker-q')?.offsetHeight ?? -1`);
const defaultName = await run(`async () => { const core = require('tabby-core'); const inj = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9]; const id = inj.get(core.ConfigService).store.terminal?.profile; const all = await inj.get(core.ProfilesService).getProfiles(); return (all.find(p => p.id === id) ?? all.find(p => p.type === 'local' && p.isBuiltin))?.name }`);
await rightClick(p.free);
let s = await state();
check('right-click on free space opens the picker: the default profile first, "New empty group" last', s.picker && s.rows[0] === defaultName && s.rows.at(-1) === 'New empty group', s.rows);
check('no filter box before typing', (await filterHeight()) === 0);
const top = await run(`() => { const m = document.querySelector('.tg-picker'); const t = m.querySelector('.tg-picker-title'); const i = [...m.querySelectorAll('.tg-pick-icon')]; return { gap: t.getBoundingClientRect().top - m.getBoundingClientRect().top - parseFloat(getComputedStyle(m).paddingTop) - parseFloat(getComputedStyle(m).borderTopWidth), title: t.textContent, lefts: [...new Set(i.map(e => { const r = document.createRange(); r.selectNodeContents(e.parentElement.lastChild); return Math.round(r.getBoundingClientRect().left) }))] } }`);
check('"+ New tab" sits at the top with no gap, and the labels line up', top.title === '+ New tab' && Math.abs(top.gap) < 1 && top.lefts.length === 1, top);
await key('Escape');
check('Escape closes it', !(await state()).picker);

await rightClick(p.free);
await call('Input.insertText', { text: 'zzz-no-match' });
await sleep(200);
check('typing shows the filter box and filters', (await state()).rows.length === 0 && (await filterHeight()) > 0);
await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', buttons: 1, clickCount: 1 });
await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', buttons: 0, clickCount: 1 });
await sleep(300);
check('a click outside closes it', !(await state()).picker);

// Root space: the default profile opens at the end, outside every group.
let before = (await state()).tabs.length;
await rightClick(p.free);
await key('Enter');
await sleep(2500);
s = await state();
check('Enter opens the first row at the root end', s.tabs.length === before + 1 && s.tabs[s.tabs.length - 1].group === null, s.tabs);

// The inner group's empty footer: Enter opens the default profile in that group.
p = await points();
before = s.tabs.length;
await rightClick(p.foot);
await key('Enter');
await sleep(2500);
s = await state();
check('a group\'s space opens the tab in that group', s.tabs.length === before + 1 && s.tabs.filter((t) => t.group === 'inner').length === 2, s.tabs);

// Unchanged: a tab row gets Tabby's menu, a group header gets the group menu, neither gets the picker.
p = await points();
await rightClick(p.header);
s = await state();
check('right-click on a group header keeps the group menu', s.menu && !s.picker);
await key('Escape');

// Empty groups: made from the picker, renamed at once, kept with no tab, filled by a drag, deleted from the header menu.
const groupsNow = () => run(`() => window.__tabbyGroups.list().map(g => ({ name: g.name, parent: g.parent, tabs: g.tabs.length }))`);
const center = (sel) => run(`(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }`, sel);
const pickRow = async (label) => {
  await call('Input.insertText', { text: label });
  await sleep(200);
  await key('Enter');
  await sleep(500);
};
p = await points();
const names = new Set((await groupsNow()).map((g) => g.name));
await rightClick(p.free);
await pickRow('New empty group');
let made = (await groupsNow()).find((g) => !names.has(g.name));
const renaming = await run(`() => !!document.querySelector('.tg-name[contenteditable="true"]')`);
check('"New empty group" makes an empty group, open for renaming', made && made.tabs === 0 && !made.parent && renaming, made);
await call('Input.insertText', { text: 'empty-e2e' });
await key('Enter');
made = (await groupsNow()).find((g) => g.name === 'empty-e2e');
check('it keeps its new name and stays with no tab', made?.tabs === 0);
const emptyRow = `.tg-empty[data-group="empty-e2e"]`;
check('it shows its header and an empty row', !!(await center(`.tg-header[data-group="empty-e2e"]`)) && !!(await center(emptyRow)));

await rightClick(await center(emptyRow));
s = await state();
check('right-click on its empty row offers a subgroup', s.rows.some((r) => r.includes('New empty subgroup')), s.rows);
await pickRow('New empty subgroup');
const sub = (await groupsNow()).find((g) => g.parent === 'empty-e2e');
check('"New empty subgroup" makes an empty subgroup', sub?.tabs === 0, await groupsNow());
await key('Escape');

const stored = await run(`() => JSON.parse(localStorage.getItem('tabby-groups:empty-groups') ?? '[]').map(g => g.name)`);
check('the main window stores its empty groups for a restart', stored.includes('empty-e2e'), stored);

// A real pointer drag of the loose tab onto the empty row.
const from = await run(`() => { const app = ${APP}; const rows = [...document.querySelectorAll('.tab-bar .tabs > tab-header')]; const r = rows[app.tabs.findIndex(t => (t.customTitle || t.title) === 'loose')].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }`);
const to = await center(emptyRow);
const mouse = (type, { x, y }, buttons) => call('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
await mouse('mousePressed', from, 1);
for (let k = 1; k <= 20; k++) {
  await mouse('mouseMoved', { x: from.x + (to.x - from.x) * k / 20, y: from.y + (to.y - from.y) * k / 20 }, 1);
  await sleep(25);
}
await sleep(300);
await mouse('mouseReleased', to, 0);
await sleep(1000);
s = await state();
check('a tab dragged onto the empty row joins the group', s.tabs.find((t) => t.title === 'loose')?.group === 'empty-e2e', s.tabs);

// Emptied again (the tab leaves), it stays; then "Delete group" removes it and its empty subgroup.
await run(`() => { const app = ${APP}; window.__tabbyGroups.removeTab(app.tabs.find(t => (t.customTitle || t.title) === 'loose')) }`);
await sleep(500);
check('emptied by moving its last tab out, it stays', (await groupsNow()).some((g) => g.name === 'empty-e2e'));
await rightClick(await center(`.tg-header[data-group="empty-e2e"]`));
const del = await run(`() => { const i = [...document.querySelectorAll('.tg-menu .tg-item')].find(e => e.textContent === 'Delete group'); i?.click(); return !!i }`);
await sleep(500);
const left = (await groupsNow()).map((g) => g.name);
check('"Delete group" deletes it and its empty subgroup', del && !left.includes('empty-e2e') && !left.includes(sub?.name), left);
// The drag moved the rows, so the points are read again.
p = await points();
await rightClick(p.header);
const items = await run(`() => [...document.querySelectorAll('.tg-menu .tg-item')].map(e => e.textContent)`);
check('a group with tabs offers no "Delete group"', items.length && !items.includes('Delete group'), items);
await key('Escape');

// Last: Tabby's tab menu is a native menu, which this script can neither see nor close.
await rightClick(p.tab);
s = await state();
check('right-click on a tab opens no picker', !s.picker);

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' ' + JSON.stringify(r.detail ?? '')}`);
console.log('By eye: Tabby\'s tab menu is open now (Esc closes it); the picker is compact (a muted "+ New tab" title, rows about as tall as Tabby\'s own menu, thin separators, no labels); each row shows its icon: a profile\'s own (as in Tabby\'s profile menu), a pin\'s, the Files folder, the group glyph with a "+"; a Files tab row with tabby-files installed; Settings > Tab groups > New-tab picker: a pin switch adds that profile to the picker and off removes it; pinned rows from tabby-groups.json "picker"; a pinned command row lands in its group at once; double-click on free space still opens the default profile; an empty group made now comes back after a Tabby restart; the phone side bar (tabby-remote) still loads.');
ws.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
