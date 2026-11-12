// node picker.e2e.mjs --port <a test Tabby's DevTools port>: checks the new-tab picker end to end with real right-clicks.
// It closes every tab in that Tabby's first window, so never point it at your own Tabby. Tabs on the left or right.
import { tabbyPages } from './tabby-window.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
    tabs: app.tabs.map(t => ({ title: t.customTitle || t.title, group: window.__tabbyGroups.list().find(g => g.id === t.__tg)?.name ?? null })), menu: !!document.querySelector('.tg-menu:not(.tg-picker)') }
}`);
// Points in the side bar: a tab row, a group header, the inner group's footer, and the free space below the rows.
const points = () => run(`() => {
  const mid = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
  const list = document.querySelector('.tab-bar .tabs');
  const l = list.getBoundingClientRect();
  return { tab: mid(list.querySelector(':scope > tab-header')), header: mid(list.querySelector('.tg-header')),
    foot: mid(list.querySelector('.tg-foot[data-name="inner"]')), free: { x: l.left + l.width / 2, y: l.bottom + 30 } };
}`);

// Right after Tabby starts (run this script then), before any tab opens: every tgTop button (Files, with tabby-files) is in
// the top row already, and its bottom copy hidden. Placement must not wait for a tab change.
const topProbe = () => run(`() => ({ top: [...document.querySelectorAll('.tab-bar > .tabs + .btn-group .tg-top-button')].map(b => b.dataset.tgTip), hidden: document.querySelectorAll('.tab-bar > .btn-space + .btn-group > .d-flex.tg-moved').length, marked: ((inj) => inj.get(require('tabby-core').ConfigService).enabledServices(inj.get(require('tabby-core').ToolbarButtonProvider)))(require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9]).flatMap(p => { try { return p.provide() } catch { return [] } }).filter(b => b?.tgTop && (b.weight ?? 0) > 0).length })`);
// Waits (15 s at most) for Tabby to be ready and its bottom bar built, without opening anything.
let atStart = { marked: 0 };
for (let k = 0; k < 30; k++) {
  try {
    if (await run(`() => !!document.querySelector('.tab-bar > .btn-space + .btn-group > .d-flex')`)) {
      await sleep(500);
      atStart = await topProbe();
      break;
    }
  } catch { }
  await sleep(500);
}

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
if (atStart.marked) check('at start, with no tab opened yet: each tgTop button is in the top row and its bottom copy hidden', atStart.top.length === atStart.marked && atStart.hidden === atStart.marked, atStart);
let p = await points();

const filterHeight = () => run(`() => document.querySelector('.tg-picker-q')?.offsetHeight ?? -1`);
const defaultName = await run(`async () => { const core = require('tabby-core'); const inj = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9]; const id = inj.get(core.ConfigService).store.terminal?.profile; const all = await inj.get(core.ProfilesService).getProfiles(); return (all.find(p => p.id === id) ?? all.find(p => p.type === 'local' && p.isBuiltin))?.name }`);
await rightClick(p.free);
let s = await state();
check('right-click on free space opens the picker: the default profile first, "New empty group" last', s.picker && s.rows[0] === defaultName && s.rows.at(-1) === 'New empty group', s.rows);
check('no filter box before typing', (await filterHeight()) === 0);
const top = await run(`() => { const m = document.querySelector('.tg-picker'); const t = m.querySelector('.tg-picker-title'); const i = [...m.querySelectorAll('.tg-pick-icon')]; return { gap: t.getBoundingClientRect().top - m.getBoundingClientRect().top - parseFloat(getComputedStyle(m).paddingTop) - parseFloat(getComputedStyle(m).borderTopWidth), title: t.textContent, lefts: [...new Set(i.map(e => { const r = document.createRange(); r.selectNodeContents(e.parentElement.lastChild); return Math.round(r.getBoundingClientRect().left) }))] } }`);
check('"+ New tab" sits at the top with no gap, and the labels line up', top.title === '+ New tab' && Math.abs(top.gap) < 1 && top.lefts.length === 1, top);
// Every scroll container in the picker: [scrollHeight, clientHeight], and whether the menu fits in the window.
const scrolls = () => run(`() => { const m = document.querySelector('.tg-picker'); if (!m) return { boxes: [], fits: false }; return { boxes: [m, ...m.querySelectorAll('*')].filter(e => /auto|scroll/.test(getComputedStyle(e).overflowY)).map(e => [e.scrollHeight, e.clientHeight]), fits: m.getBoundingClientRect().bottom <= innerHeight } }`);
let sc = await scrolls();
check('a few rows show no scrollbar', sc.boxes.every(([h, c]) => h <= c) && sc.fits, sc);
await key('Escape');
check('Escape closes it', !(await state()).picker);

// 40 pins (written to this test Tabby's tabby-groups.json, then put back): the list scrolls and the menu stays in the window.
const pinsFile = await run(`() => { const path = require('path'); const fs = require('fs'); const core = require('tabby-core'); const inj = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9]; const f = path.join(inj.get(core.BOOTSTRAP_DATA).userPluginsPath, '..', 'tabby-groups.json'); const before = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; const cur = before ? JSON.parse(before) : {}; fs.writeFileSync(f, JSON.stringify({ ...cur, picker: Array.from({ length: 40 }, (_, k) => ({ label: 'pin ' + k, command: 'echo ' + k })) })); return { f, before } }`);
try {
  await sleep(800);
  await rightClick(p.free);
  sc = await scrolls();
  check('40 pins: the list scrolls, and the menu fits in the window', sc.boxes.some(([h, c]) => h > c) && sc.fits, sc);
  await key('Escape');
} finally {
  await run(`(x) => { const fs = require('fs'); x.before === null ? fs.unlinkSync(x.f) : fs.writeFileSync(x.f, x.before) }`, pinsFile);
  await sleep(800);
}

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

// A group header's "+": right-click opens the picker for that group (not the group menu); left-click is as before.
const plusAt = () => run(`() => { const b = document.querySelector('.tg-header[data-name="outer"] .tg-add'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }`);
const inOuter = (tabs) => tabs.filter((t) => t.group === 'outer').length;
let plus = await plusAt();
await rightClick(plus);
s = await state();
check('right-click on a group\'s "+" opens the picker for it, not the group menu', s.picker && !s.menu && s.rows.at(-1) === 'New empty subgroup', s);
before = inOuter(s.tabs);
await key('Enter');
await sleep(2500);
s = await state();
check('a pick from it lands in that group', inOuter(s.tabs) === before + 1, s.tabs);
plus = await plusAt();
for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, ...plus, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
await sleep(2500);
s = await state();
check('left-click on "+" still opens a tab in the group, with no picker', !s.picker && inOuter(s.tabs) === before + 2, s.tabs);

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
const emptyRow = `.tg-empty[data-name="empty-e2e"]`;
const emptyText = await run(`(sel) => document.querySelector(sel)?.textContent`, emptyRow);
check('it shows its header, its +, and a muted "Empty" row', !!(await center(`.tg-header[data-name="empty-e2e"] .tg-add`)) && emptyText === 'Empty', emptyText);

await rightClick(await center(emptyRow));
s = await state();
check('right-click on its "Empty" row offers a subgroup', s.rows.some((r) => r.includes('New empty subgroup')), s.rows);
await key('Escape');
await rightClick(await center(`.tg-header[data-name="empty-e2e"] .tg-add`));
s = await state();
check('right-click on its + offers a subgroup', s.rows.some((r) => r.includes('New empty subgroup')), s.rows);
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
await rightClick(await center(`.tg-header[data-name="empty-e2e"]`));
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

// placeAfter: a tab opened from another lands right after it, in its group; from a loose tab, right after it at the top level.
const placed = await run(`async () => {
  const app = ${APP};
  const tg = window.__tabbyGroups;
  const byTitle = t => app.tabs.find(x => (x.customTitle || x.title) === t);
  const where = (title, from) => {
    const tab = byTitle(title);
    return { group: tg.list().find(g => g.id === tab.__tg)?.name ?? null, right: app.tabs.indexOf(tab) === app.tabs.indexOf(byTitle(from)) + 1 };
  };
  await tg.open({ title: 'after-o1' });
  const out = { inGroup: { ok: tg.placeAfter(byTitle('after-o1'), byTitle('o1')), ...where('after-o1', 'o1') } };
  // The same tab, now in a group, placed after the loose tab: it leaves the group and moves.
  out.toTop = { ok: tg.placeAfter(byTitle('after-o1'), byTitle('loose')), ...where('after-o1', 'loose') };
  out.gone = tg.placeAfter(byTitle('after-o1'), {});
  return out;
}`);
check('placeAfter: in the source tab\'s group, right after it', placed.inGroup.ok && placed.inGroup.group === 'outer' && placed.inGroup.right, placed);
check('placeAfter: after a loose tab, it leaves its group and lands right after it', placed.toTop.ok && placed.toTop.group === null && placed.toTop.right, placed);
check('placeAfter: a source tab not open does nothing', placed.gone === false, placed);

// Esc during a drag cancels it: on release, the tab order, groups and window count are as before.
const layout = async () => JSON.stringify({ tabs: (await state()).tabs, groups: await groupsNow(), windows: ((await tabbyPages(port)) ?? []).length });
const escDrag = async (from, to) => {
  await mouse('mousePressed', from, 1);
  for (let k = 1; k <= 20; k++) {
    await mouse('mouseMoved', { x: from.x + (to.x - from.x) * k / 20, y: from.y + (to.y - from.y) * k / 20 }, 1);
    await sleep(25);
  }
  await sleep(300);
  await key('Escape');
  await mouse('mouseMoved', to, 1);
  await mouse('mouseReleased', to, 0);
  await sleep(2500);
};
const rowCenter = (i) => run(`(i) => { const r = document.querySelectorAll('.tab-bar .tabs > tab-header')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }`, i);
let was = await layout();
await escDrag(await rowCenter(0), await rowCenter(2));
check('Esc during a tab drag onto another tab: nothing moves or groups', (await layout()) === was && !(await run(`() => !!document.querySelector('.tg-drop-line, .tg-drop-onto')`)), JSON.parse(await layout()));
was = await layout();
p = await points();
await escDrag(await center('.tg-header[data-name="outer"]'), p.free);
check('Esc during a group header drag: the group stays', (await layout()) === was, JSON.parse(await layout()));
// Onto the terminal (Tabby's split zones): no split. The pane counts show one.
const panes = () => run(`() => ${APP}.tabs.map(t => t.getAllTabs?.().length ?? 1).join(',')`);
was = await layout() + await panes();
await escDrag(await rowCenter(0), await center('.content-tab-active'));
check('Esc during a tab drag onto the terminal: no split', (await layout()) + (await panes()) === was, await panes());
// Out of the window: the page must see the pointer outside, or the check proves nothing.
await run(`() => { window.__tgSawOutside = false; document.addEventListener('pointermove', e => { if (e.clientX < 0) window.__tgSawOutside = true }, true) }`);
was = await layout();
const r0 = await rowCenter(0);
await escDrag(r0, { x: -60, y: r0.y });
const sawOutside = await run(`() => window.__tgSawOutside`);
check('Esc during a drag out of the window: no move and no new window', sawOutside && (await layout()) === was, { sawOutside, layout: JSON.parse(await layout()) });

// Empty groups keep their place: one emptied between two tabs stays there; a new one shows where it was made.
const follows = (a, b) => run(`([a, b]) => !!(document.querySelector(a)?.compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING)`, [a, b]);
const tabRow = (title) => run(`(title) => { const app = ${APP}; const i = app.tabs.findIndex(t => (t.customTitle || t.title) === title); document.querySelectorAll('.tab-bar .tabs > tab-header')[i]?.setAttribute('data-e2e', title) }`, title);
await run(`async () => { const tg = window.__tabbyGroups; await tg.open({ title: 'm1', group: 'mid' }); await tg.open({ title: 'tail' }) }`);
await sleep(2500);
await run(`async () => { const app = ${APP}; await app.closeTab(app.tabs.find(t => (t.customTitle || t.title) === 'm1'), false, true) }`);
await sleep(800);
await tabRow('tail');
check('a group emptied by closing its last tab stays where it was, above the tab after it', await follows('.tg-header[data-name="mid"]', 'tab-header[data-e2e="tail"]'), await groupsNow());
const midStored = await run(`() => JSON.parse(localStorage.getItem('tabby-groups:empty-groups') ?? '[]').find(g => g.name === 'mid')`);
check('its place is stored for a restart', typeof midStored?.slot === 'number', midStored);
// A right-click in outer's side band beside inner's tab: the new subgroup of outer goes right after inner.
const band = await run(`() => { const app = ${APP}; const list = document.querySelector('.tab-bar .tabs'); const row = document.querySelectorAll('.tab-bar .tabs > tab-header')[app.tabs.findIndex(t => window.__tabbyGroups.list().find(g => g.id === t.__tg)?.name === 'inner')]; const r = row.getBoundingClientRect(); const y = r.top + r.height / 2; for (let x = list.getBoundingClientRect().left + 1; x < r.left + r.width / 2; x++) { if (document.elementFromPoint(x, y) === list) return { x, y } } return null }`);
const before2 = new Set((await groupsNow()).map((g) => g.name));
if (band) {
  await rightClick(band);
  await pickRow('New empty subgroup');
  await key('Escape');
}
const spot = (await groupsNow()).find((g) => !before2.has(g.name));
check('a new empty subgroup made by a right-click in a band shows right after the unit above the click', spot?.parent === 'outer'
  && await run(`(n) => document.querySelector('.tg-header[data-name="' + n + '"]')?.previousElementSibling?.matches('.tg-foot[data-name="inner"]')`, spot.name), { band, spot });
const order = await run(`() => window.__tabbyGroups.list().filter(g => g.parent === 'outer').map(g => g.name)`);
check('list() keeps the side-bar order', order.indexOf(spot?.name) === order.indexOf('inner') + 1, order);

// Close group: closes the tabs (subgroups too) through Tabby's close, then removes the groups. No question when nothing is busy or pinned.
const asked = () => run(`() => window.__tgAsked`);
const answer = (response) => run(`(response) => { const core = require('tabby-core'); const p = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9].get(core.PlatformService); window.__tgAsked = null; p.__tgReal ??= p.showMessageBox; p.showMessageBox = async (o) => { window.__tgAsked = o.message; return { response } } }`, response);
await answer(1);
await run(`async () => { const tg = window.__tabbyGroups; await tg.open({ title: 'c1', group: 'closeme' }); await tg.open({ title: 'c2', group: 'closeme' }); await tg.open({ title: 'c3', group: 'closesub', parent: 'closeme' }) }`);
await sleep(2500);
// Tabby keeps the last 5 closed tabs, so the check is that the newest 3 are new, not that the stack grew.
await run(`() => { window.__tgStack0 = [...${APP}.closedTabsStack] }`);
await rightClick(await center('.tg-header[data-name="closeme"]'));
const closeItem = await run(`() => { const i = [...document.querySelectorAll('.tg-menu .tg-item')].find(e => e.textContent === 'Close group'); i?.click(); return !!i }`);
await sleep(2000);
s = await state();
let left2 = (await groupsNow()).map((g) => g.name);
check('"Close group" in the header menu closes its tabs and subgroups, with no question', closeItem && !(await asked())
  && !s.tabs.some((t) => ['c1', 'c2', 'c3'].includes(t.title)) && !left2.includes('closeme') && !left2.includes('closesub'), { s, left2 });
check('each closed tab can be reopened ("Reopen closed tab")', await run(`() => { const s = ${APP}.closedTabsStack; return s.length >= 3 && s.slice(-3).every(t => !window.__tgStack0.includes(t)) }`));
// A pinned tab and a running command: it asks first; Cancel keeps everything, Close closes all.
await run(`async () => { const app = ${APP}; const tg = window.__tabbyGroups; await tg.open({ title: 'p1', group: 'askme' }); await tg.open({ title: 'r1', group: 'askme', run: process.platform === 'win32' ? 'ping -n 60 127.0.0.1' : 'sleep 60' }); tg.setTabPinned(app.tabs.find(t => (t.customTitle || t.title) === 'p1'), true) }`);
await sleep(4000);
const cancelled = await run(`() => window.__tabbyGroups.closeGroup('askme')`);
check('closeGroup asks when a tab is busy or pinned, and Cancel keeps the group', cancelled === false && /^Close 2 tabs in askme? [12] (is|are) busy, 1 is pinned.$/.test(await asked() ?? '')
  && (await groupsNow()).some((g) => g.name === 'askme' && g.tabs === 2), await asked());
await answer(0);
const closed = await run(`() => window.__tabbyGroups.closeGroup('askme')`);
await sleep(1500);
check('Close closes the pinned and the busy tab too', closed === true && !(await groupsNow()).some((g) => g.name === 'askme') && !(await state()).tabs.some((t) => ['p1', 'r1'].includes(t.title)), await state());
await run(`() => { const core = require('tabby-core'); const p = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9].get(core.PlatformService); p.showMessageBox = p.__tgReal; delete p.__tgReal }`);
p = await points();

// A group with exactly 2 tabs: dragging one onto the other makes a subgroup of both; the group stays, holding it.
await run(`async () => { const tg = window.__tabbyGroups; await tg.open({ title: 'two1', group: 'two' }); await tg.open({ title: 'two2', group: 'two' }) }`);
await sleep(2500);
const rowOf = (title) => run(`(title) => { const app = ${APP}; const r = document.querySelectorAll('.tab-bar .tabs > tab-header')[app.tabs.findIndex(t => (t.customTitle || t.title) === title)].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }`, title);
const fromTwo = await rowOf('two2');
const toTwo = await rowOf('two1');
await mouse('mousePressed', fromTwo, 1);
for (let k = 1; k <= 20; k++) {
  await mouse('mouseMoved', { x: fromTwo.x + (toTwo.x - fromTwo.x) * k / 20, y: fromTwo.y + (toTwo.y - fromTwo.y) * k / 20 }, 1);
  await sleep(25);
}
await sleep(300);
const ontoMark = await run(`() => !!document.querySelector('.tg-drop-onto')`);
await mouse('mouseReleased', toTwo, 0);
await sleep(1000);
const twoSub = (await groupsNow()).find((g) => g.parent === 'two');
s = await state();
check('in a 2-tab group, a tab dragged onto the other makes a subgroup of both, and the group stays', ontoMark && twoSub?.tabs === 2
  && s.tabs.filter((t) => ['two1', 'two2'].includes(t.title)).every((t) => t.group === twoSub.name) && (await groupsNow()).some((g) => g.name === 'two'), { ontoMark, groups: await groupsNow() });

// Names are unique among siblings only: two "owners" under different parents; a move next to a same-named sibling adds " (1)".
const scoped = await run(`async () => {
  const tg = window.__tabbyGroups;
  await tg.open({ title: 'ow1', group: 'owners', parent: 'tooling' });
  await tg.open({ title: 'ow2', group: 'owners', parent: 'web' });
  const both = tg.list().filter(g => g.name === 'owners').map(g => g.path).sort();
  let ambiguous = null;
  try { tg.closeGroup('owners') } catch (e) { ambiguous = e.message }
  const moved = tg.setParent('web/owners', 'tooling');
  const afterMove = tg.list().filter(g => g.parent === 'tooling').map(g => g.name).sort();
  tg.rename('tooling/owners', 'leads');
  tg.rename('tooling/owners (1)', 'owners');
  const afterRename = tg.list().filter(g => g.parent === 'tooling').map(g => g.name).sort();
  const g = tg.list().find(x => x.path === 'tooling/owners');
  return { both, ambiguous, moved, afterMove, afterRename, hasId: !!g?.id && g.parentId === tg.list().find(x => x.path === 'tooling')?.id };
}`);
await sleep(1000);
check('two groups named "owners" under different parents', JSON.stringify(scoped.both) === JSON.stringify(['tooling/owners', 'web/owners']), scoped);
check('a bare name that fits two groups is refused, asking for the path', /give its path/.test(scoped.ambiguous ?? ''), scoped);
check('a move next to a same-named sibling becomes "owners (1)"', scoped.moved && JSON.stringify(scoped.afterMove) === JSON.stringify(['owners', 'owners (1)']), scoped);
check('renaming back to a free name drops the suffix', JSON.stringify(scoped.afterRename) === JSON.stringify(['leads', 'owners']), scoped);
check('list() gives id, parentId and path', scoped.hasId, scoped);
const shown = await run(`() => [...document.querySelectorAll('.tg-header')].filter(h => h.dataset.name === 'owners' || h.dataset.name === 'leads').length`);
check('both show in the side bar', shown === 2, shown);
const closed2 = await run(`async () => { const tg = window.__tabbyGroups; const r = await tg.closeGroup('tooling'); await tg.closeGroup('web'); return r }`);
await sleep(1000);
check('closeGroup takes a name or a path; the groups go', closed2 === true && !(await groupsNow()).some((g) => ['tooling', 'web', 'owners', 'leads'].includes(g.name)), await groupsNow());

// The small tab menu: Tabby builds it in the tab header (a native menu, so the items are read from the builder and
// clicked through it). A tab in a group, with a folder inside this repo.
const menu = await run(`async () => {
  const app = ${APP};
  const tg = window.__tabbyGroups;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await tg.open({ title: 'm1', group: 'menug', cwd: ${JSON.stringify(path.dirname(fileURLToPath(import.meta.url)))} });
  await sleep(2500);
  const by = t => app.tabs.find(x => (x.customTitle || x.title) === t);
  const ng = require('@angular/core');
  const builder = async t => {
    const c = ng.ɵgetLContext(document.querySelectorAll('.tab-bar .tabs > tab-header')[app.tabs.indexOf(t)]);
    return c.lView[c.nodeIndex][8].buildContextMenu();
  };
  const labels = xs => xs.map(i => i.type === 'separator' ? '—' : i.label);
  const out = {};
  // The group goes whatever fails, so a later step starts clean.
  try {
    const items = await builder(by('m1'));
    Object.assign(out, { small: labels(items), openIn: labels(items[0].submenu ?? []), more: labels(items.at(-1)?.submenu ?? []) });
    items.find(i => i.label === 'Pin').click();
    out.pinnedNow = labels(await builder(by('m1'))).includes('Unpin');
    (await builder(by('m1'))).find(i => i.label === 'Unpin').click();
    items.find(i => i.label === 'Duplicate').click();
    await sleep(2500);
    const m1 = by('m1');
    const dup = app.tabs[app.tabs.indexOf(m1) + 1];
    out.dup = { right: !!dup && dup !== m1, sameGroup: dup?.__tg === m1.__tg };
  } catch (e) {
    out.error = String(e);
  } finally {
    await tg.closeGroup('menug');
  }
  return out;
}`);
const menuOrder = ['Open in', '—', 'Add to group', 'Rename', 'Pin', 'Duplicate', 'Copy path', '—', 'Move to window', 'Close group', '—', 'More options…'];
check('a tab\'s right-click menu is the small one, in order', JSON.stringify(menu.small ?? []) === JSON.stringify(menuOrder), menu.small);
check('Open in offers Explorer or Finder (Tabby Files and VS Code when there)', (menu.openIn ?? []).includes(process.platform === 'darwin' ? 'Finder' : 'Explorer'), menu.openIn);
check('Pin pins the tab (the item then reads Unpin)', menu.pinnedNow, menu);
check('Duplicate puts the copy right after the tab, in its group', menu.dup?.right && menu.dup?.sameGroup, menu);
check('More options… holds Tabby\'s full menu (Duplicate, Close, the plugin\'s own items)', ['Duplicate', 'Close', 'Add to group', 'Move to window'].every((l) => menu.more?.includes(l)), menu);

// After the active tab closes: the most recent tab of its group shows, else the most recent tab anywhere.
const focus = await run(`async () => {
  const app = ${APP};
  const tg = window.__tabbyGroups;
  const by = t => app.tabs.find(x => (x.customTitle || x.title) === t);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await tg.open({ title: 'f1', group: 'focusg' }); await tg.open({ title: 'f2', group: 'focusg' }); await tg.open({ title: 'f3', group: 'focusg' });
  await tg.open({ title: 'fout' });
  for (const t of ['f1', 'fout', 'f3']) { app.selectTab(by(t)); await sleep(100) }
  await app.closeTab(by('f3'), false, true); await sleep(300);
  const inGroup = app.activeTab && (app.activeTab.customTitle || app.activeTab.title);
  await app.closeTab(by('f1'), false, true); await sleep(300);
  const sameGroupLeft = app.activeTab && (app.activeTab.customTitle || app.activeTab.title);
  app.selectTab(by('f2')); await sleep(100);
  await app.closeTab(by('f2'), false, true); await sleep(300);
  const lastOfGroup = app.activeTab && (app.activeTab.customTitle || app.activeTab.title);
  await app.closeTab(by('fout'), false, true);
  tg.deleteGroup('focusg');
  return { inGroup, sameGroupLeft, lastOfGroup };
}`);
check('closing the active tab shows the most recent tab of its group, not the most recent tab outside it', focus.inGroup === 'f1', focus);
check('again: the group\'s other tab shows, though a tab outside was used more recently', focus.sameGroupLeft === 'f2', focus);
check('the last tab of its group closed: the most recent tab anywhere shows', focus.lastOfGroup === 'fout', focus);

// A double-click inside a group (its footer's free space, an empty group's "Empty" row) opens no tab; outside every group, one.
const dbl = async (pt) => {
  for (const clickCount of [1, 2]) {
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...pt, button: 'left', buttons: 1, clickCount });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pt, button: 'left', buttons: 0, clickCount });
  }
  await sleep(2500);
};
const tabCount = async () => (await state()).tabs.length;
// The point must hit that row (or the free space under the list), or "no new tab" would prove nothing.
const hits = (pt, sel) => run(`([pt, sel]) => { const e = document.elementFromPoint(pt.x, pt.y); return !!e && (sel ? !!e.closest(sel) : !!e.closest('.tab-bar') && !e.closest('tab-header, .tg-header, .tg-foot, .tg-empty')) }`, [pt, sel]);
// An empty group: its only tab closed (the group stays).
await run(`async () => {
  const app = ${APP};
  await window.__tabbyGroups.open({ title: 'dblE', group: 'dblempty' });
  await app.closeTab(app.tabs.find(t => (t.customTitle || t.title) === 'dblE'), false, true);
}`);
await sleep(1000);
const n0 = await tabCount();
const footAt = await center('.tg-foot[data-name="inner"]');
const footHit = await hits(footAt, '.tg-foot');
await dbl(footAt);
check('a double-click on a group\'s free space opens no tab', footHit && (await tabCount()) === n0, { footHit, n0 });
const emptyAt = await center('.tg-empty[data-name="dblempty"]');
const emptyHit = !!emptyAt && await hits(emptyAt, '.tg-empty');
if (emptyHit) await dbl(emptyAt);
check('a double-click on an empty group\'s "Empty" row opens no tab', emptyHit && (await tabCount()) === n0, { emptyHit, n0 });
p = await points();
const freeHit = await hits(p.free, null);
await dbl(p.free);
const afterDbl = (await state()).tabs;
const opened = afterDbl.length === n0 + 1;
check('a double-click on the free space outside every group still opens a tab there', freeHit && opened && afterDbl.at(-1).group === null, { freeHit, last: afterDbl.slice(-2) });
// Only the tab this step opened is closed.
await run(`async (opened) => { const app = ${APP}; window.__tabbyGroups.deleteGroup('dblempty'); if (opened) await app.closeTab(app.tabs.at(-1), false, true) }`, opened);
await sleep(800);

// A toolbar button marked tgTop: true shows in the top row after + and the profile button, with the same height row.
const topBtn = await run(`async () => {
  const core = require('tabby-core');
  const inj = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[9];
  const providers = inj.get(core.ToolbarButtonProvider);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const row = () => document.querySelector('.tab-bar > .tabs + .btn-group');
  const before = row().getBoundingClientRect().height;
  const fake = { provide: () => [{ icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/></svg>', title: 'tgTop e2e', tgTop: true, weight: 1, click: () => { window.__tgTopClicked = true } }] };
  providers.push(fake);
  const out = {};
  try {
    window.__tabbyGroups.setCollapsed('outer', false); await sleep(500);
    const btn = row().querySelector('.tg-top-button[aria-label="tgTop e2e"]');
    out.shown = !!btn;
    out.last = !!btn && btn.parentElement.parentElement === row() && !btn.parentElement.nextElementSibling;
    out.sameHeight = Math.abs(row().getBoundingClientRect().height - before) < 1;
    btn?.click();
    out.clicked = !!window.__tgTopClicked;
  } finally {
    providers.splice(providers.indexOf(fake), 1);
    delete window.__tgTopClicked;
    window.__tabbyGroups.setCollapsed('outer', false); await sleep(500);
  }
  out.goneAfter = !row().querySelector('.tg-top-button[aria-label="tgTop e2e"]');
  return out;
}`);
check('a tgTop toolbar button shows at the end of the top row, which keeps its height', topBtn.shown && topBtn.last && topBtn.sameHeight, topBtn);
check('its click runs the button\'s own click', topBtn.clicked, topBtn);
check('it goes when its plugin no longer provides it', topBtn.goneAfter, topBtn);
// Tabby builds its bottom bar once, so only a tgTop button there from the start (Files, with tabby-files) shows the hiding.
const moved = await run(`() => ({ top: [...document.querySelectorAll('.tab-bar > .tabs + .btn-group .tg-top-button')].map(b => b.dataset.tgTip),
  hidden: document.querySelectorAll('.tab-bar > .btn-space + .btn-group > .d-flex.tg-moved').length })`);
if (moved.top.length) check('a tgTop button from the start is hidden in the bottom bar (no second copy)', moved.hidden === moved.top.length, moved);

// Tabby rebuilding its bar (simulated: the plugin's buttons and marks gone, a node added in the bottom bar) puts them back
// through the page watcher alone, with no tab change and no redraw.
if (atStart.marked) {
  await run(`() => {
    document.querySelectorAll('.tg-top-buttons').forEach(e => e.remove());
    document.querySelectorAll('.tg-moved').forEach(e => e.classList.remove('tg-moved'));
    document.querySelector('.tab-bar > .btn-space + .btn-group').append(Object.assign(document.createElement('span'), { className: 'tg-e2e-poke' }));
  }`);
  await sleep(500);
  const rebuilt = await topProbe();
  await run(`() => document.querySelectorAll('.tg-e2e-poke').forEach(e => e.remove())`);
  check('after Tabby rebuilds its bar, the tgTop buttons are back in the top row and the bottom copies hidden', rebuilt.top.length === rebuilt.marked && rebuilt.hidden === rebuilt.marked, rebuilt);
}

// The search box takes the whole top row while focused (the buttons slide out), and shrinks back on blur, text kept.
const searchState = () => run(`() => {
  const bar = document.querySelector('.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar');
  const input = bar.querySelector('.tg-search'), group = bar.querySelector(':scope > .tabs + .btn-group'), tb = bar.querySelector(':scope > .tg-toolbar');
  const cs = getComputedStyle(group);
  return { input: input.getBoundingClientRect().width, row: bar.clientWidth - parseFloat(getComputedStyle(tb).paddingLeft) - parseFloat(getComputedStyle(tb).paddingRight),
    group: group.getBoundingClientRect().width, opacity: +cs.opacity, events: cs.pointerEvents, transition: cs.transitionDuration, value: input.value, focused: document.activeElement === input };
}`);
await run(`() => document.querySelector('.tg-search').blur()`);
await sleep(400);
const narrow = await searchState();
await run(`() => { const i = document.querySelector('.tg-search'); i.focus(); i.value = 'o1'; i.dispatchEvent(new Event('input')) }`);
await sleep(100);
const midway = await searchState();
await sleep(300);
const wide = await searchState();
check('the search grows smoothly: about halfway the buttons are partly gone', midway.group > 1 && midway.group < narrow.group - 1, { narrow, midway });
check('focused, the search takes the whole top row and the buttons are hidden', Math.abs(wide.input - wide.row) < 2 && wide.group < 1 && wide.opacity === 0 && wide.events === 'none', { narrow, wide });
await run(`() => document.querySelector('.tg-search').blur()`);
await sleep(400);
const back = await searchState();
check('on blur it shrinks back with its text, and the buttons return', Math.abs(back.input - narrow.input) < 2 && back.group > 0 && back.opacity === 1 && back.value === 'o1', back);
await run(`() => { const i = document.querySelector('.tg-search'); i.focus(); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }`);
await sleep(400);
const esc = await searchState();
check('Esc clears the search and blurs it', esc.value === '' && !esc.focused, esc);
await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const reduced = await run(`async () => {
  const i = document.querySelector('.tg-search'), group = document.querySelector('.tab-bar > .tabs + .btn-group');
  i.focus(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = { transition: getComputedStyle(group).transitionDuration, group: group.getBoundingClientRect().width };
  i.blur(); return out;
}`);
await call('Emulation.setEmulatedMedia', { features: [] });
check('with reduced motion, no transition: the row is full at once', reduced.transition.split(',').every((d) => parseFloat(d) === 0) && reduced.group < 1, reduced);
await sleep(400);

// A tooltip stays put while its row is redrawn: hovering a group header for 3 s, with a redraw (a state change rebuilds
// the headers) every 250 ms and the pointer nudged, the tooltip appears once and never hides and shows again.
await run(`() => {
  window.__tgTips = { added: 0, removed: 0 };
  window.__tgTipWatch = new MutationObserver(rs => rs.forEach(r => {
    r.addedNodes.forEach(n => { if (n.classList?.contains('tg-tip')) window.__tgTips.added++ });
    r.removedNodes.forEach(n => { if (n.classList?.contains('tg-tip')) window.__tgTips.removed++ });
  }));
  window.__tgTipWatch.observe(document.body, { childList: true });
}`);
const headerAt = await run(`() => { const h = document.querySelector('.tg-header[data-name="outer"]'); const r = h.getBoundingClientRect(); return { x: r.right - 40, y: r.top + r.height / 2 } }`);
// Redraw first, then a pointer move, so the new header always gets its mouseover.
for (let k = 0; k < 12; k++) {
  await run(`() => ${APP}.emitTabsChanged()`);
  await sleep(100);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: headerAt.x + (k % 2), y: headerAt.y, buttons: 0 });
  await sleep(150);
}
const tips = await run(`() => { window.__tgTipWatch.disconnect(); return { ...window.__tgTips, shown: !!document.querySelector('.tg-tip.show'), text: document.querySelector('.tg-tip')?.textContent } }`);
check('hovering a group header through redraws: its tooltip shows once and stays', tips.added === 1 && tips.removed === 0 && tips.shown && tips.text === 'outer', tips);
await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, buttons: 0 });
await sleep(300);

// A tab dropped right beside its own row stays put, also with a collapsed group (hidden tabs once skewed Tabby's own
// drop index, and the tab moved down).
{
  await run(`() => window.__tabbyGroups.setCollapsed('outer', true)`);
  await sleep(500);
  const order = async () => (await state()).tabs.map((t) => t.title).join('|');
  const before = await order();
  // The bug needs hidden tabs after the dragged one: the first shown row with a hidden row below it.
  const at = await run(`() => { const rows = [...document.querySelectorAll('.tab-bar .tabs > tab-header')]; const k = rows.findIndex((r, i) => r.offsetHeight && rows.slice(i + 1).some(x => !x.offsetHeight)); if (k < 0) return null; const r = rows[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height } }`);
  if (!at) throw new Error('picker.e2e: no shown tab above a collapsed group');
  await mouse('mousePressed', at, 1);
  for (let k = 1; k <= 10; k++) {
    await mouse('mouseMoved', { x: at.x, y: at.y - k * 2 }, 1);
    await sleep(25);
  }
  // Back to the row's own upper edge: the line between it and the tab above.
  await mouse('mouseMoved', { x: at.x, y: at.y - at.h / 2 + 2 }, 1);
  await sleep(300);
  await mouse('mouseReleased', { x: at.x, y: at.y - at.h / 2 + 2 }, 0);
  await sleep(1000);
  const after = await order();
  check('a tab dropped beside its own row, with a group collapsed, stays where it was', after === before, { before, after });
  await run(`() => window.__tabbyGroups.setCollapsed('outer', false)`);
  await sleep(500);
}

// A group the user folds slides its tab rows shut and open (0.1 s); nothing slides without a fold.
{
  const rowOf = `[...document.querySelectorAll('.tab-bar .tabs > tab-header')].find(r => r.querySelector('.name')?.firstChild?.textContent.trim() === 'i1')`;
  const still = await run(`() => !document.querySelector('.tabs.tg-anim')`);
  const full = await run(`() => ${rowOf}.offsetHeight`);
  // Another tab active, or the collapsed group would still show it.
  await run(`() => { const app = ${APP}; app.selectTab(app.tabs.find(t => (t.customTitle || t.title) === 'loose')) }`);
  await sleep(300);
  const fold = await run(`async () => {
    window.__tabbyGroups.setCollapsed('inner', true);
    await new Promise(r => setTimeout(r, 45));
    const row = ${rowOf};
    const mid = { h: row.getBoundingClientRect().height, anim: !!row.parentElement.classList.contains('tg-anim') };
    await new Promise(r => setTimeout(r, 300));
    return { mid, end: row.offsetHeight, anim: !!document.querySelector('.tabs.tg-anim') };
  }`);
  check('folding: the tab rows slide shut (part height midway, none at the end, no animation class after)', still && fold.mid.anim && fold.mid.h > 0 && fold.mid.h < full && fold.end === 0 && !fold.anim, { still, full, fold });
  const open = await run(`async () => {
    window.__tabbyGroups.setCollapsed('inner', false);
    await new Promise(r => setTimeout(r, 45));
    const mid = ${rowOf}.getBoundingClientRect().height;
    await new Promise(r => setTimeout(r, 300));
    return { mid, end: ${rowOf}.offsetHeight };
  }`);
  check('opening: the tab rows slide open (part height midway, full at the end)', open.mid > 0 && open.mid < full && open.end === full, { full, open });
  // Reduced motion: no slide, the row gone at once.
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const instant = await run(`async () => {
    window.__tabbyGroups.setCollapsed('inner', true);
    await new Promise(r => setTimeout(r, 45));
    return ${rowOf}.getBoundingClientRect().height;
  }`);
  await call('Emulation.setEmulatedMedia', { features: [] });
  check('with reduced motion the rows fold at once', instant === 0, instant);
  await run(`() => window.__tabbyGroups.setCollapsed('inner', false)`);
  await sleep(300);
}

// An empty group has an × beside its + that closes it in one click; a group with tabs, or with subgroups, has none.
{
  await run(`async () => {
    const app = ${APP};
    const tg = window.__tabbyGroups;
    for (const [title, group, parent] of [['x1', 'xempty'], ['x2', 'xparent'], ['x3', 'xsub', 'xparent']]) {
      await tg.open({ title, group, ...parent ? { parent } : {} });
      await app.closeTab(app.tabs.find(t => (t.customTitle || t.title) === title), false, true);
    }
  }`);
  await sleep(800);
  const xs = await run(`() => ({
    empty: document.querySelector('.tg-header[data-name="xempty"] .tg-close')?.dataset.tgTip ?? null,
    withSub: !!document.querySelector('.tg-header[data-name="xparent"] .tg-close'),
    withTabs: !!document.querySelector('.tg-header[data-name="outer"] .tg-close'),
  })`);
  check('an empty group shows an × with the tooltip "Close group"; a group with tabs or subgroups shows none', xs.empty === 'Close group' && !xs.withSub && !xs.withTabs, xs);
  const xAt = await center('.tg-header[data-name="xempty"] .tg-close');
  for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, ...xAt, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await sleep(500);
  check('one click on the × removes the empty group', !(await groupsNow()).some((g) => g.name === 'xempty'), await groupsNow());
  await run(`() => window.__tabbyGroups.deleteGroup('xparent')`);
  await sleep(300);
}

// Last: Tabby's tab menu is a native menu, which this script can neither see nor close.
await rightClick(p.tab);
s = await state();
check('right-click on a tab opens no picker', !s.picker);
console.log('By eye: the menu now open is the small one: Open in > Explorer/Finder, Tabby Files and VS Code open the tab\'s folder (a Files tab lands right after the tab, in its group); Arrow keys and Enter work in it; Shift+F10 (or the menu key) opens it for the active tab, also with the terminal focused; Settings > Tab groups > Small tab menu off brings back Tabby\'s full menu.');

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' ' + JSON.stringify(r.detail ?? '')}`);
console.log('By eye: Tabby\'s tab menu is open now (Esc closes it); the picker is compact (a muted "+ New tab" title, rows about as tall as Tabby\'s own menu, thin separators, no labels); each row shows its icon: a profile\'s own (as in Tabby\'s profile menu), a pin\'s, the Files folder, the group glyph with a "+"; a Files tab row with tabby-files installed; Settings > Tab groups > New-tab picker: a pin switch adds that profile to the picker and off removes it; pinned rows from tabby-groups.json "picker"; a pinned command row lands in its group at once; double-click on free space outside every group still opens the default profile; the empty groups made now (mid, and the subgroup after inner) come back after a Tabby restart, each in its place; after the upgrade to group ids, every group comes back with its parent, colour, pin and tabs, and a tabby-groups-backup-<time>.json sits next to tabby-groups.json; in a side bar narrowed under 130px, an empty group\'s header shows a small + (no arrow) inside its panel; the phone side bar (tabby-remote) still loads; with tabby-files setting tgTop on its Files button, that button sits in the top row after + (not in the bottom bar), and with tabs on top it is back in Tabby\'s toolbar.');
ws.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
