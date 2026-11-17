// node test-tabmenu.js: checks the small tab menu (tabmenu.js) with no Tabby: its items, and where VS Code is.
// On screen: picker.e2e.mjs.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findCode, smallMenu, groupMenu } = require('./tabmenu')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-menu-'))
try {
    // Items, in order. "Open in" offers Tabby Files (with tabby-files), Explorer or Finder, and VS Code (with code);
    // The group's menu only in a group; Close closes just the tab; the pin item names what it will do.
    const labels = items => items.map(i => i.type === 'separator' ? '—' : i.label)
    const called = []
    const act = Object.fromEntries(['files', 'open', 'code', 'rename', 'pin', 'duplicate', 'copy', 'close'].map(k => [k, x => called.push(x === undefined ? [k] : [k, x])]))
    const more = [{ label: 'Duplicate' }]
    let items = smallMenu({ cwd: tmp, files: true, code: true, pinned: false, toGroup: { label: 'Move to group', submenu: [] }, group: { label: 'Group: g', submenu: [] }, moveToWindow: { label: 'Move to window', submenu: [] }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open in', '—', 'Move to group', 'Rename', 'Pin', 'Duplicate', 'Copy path', '—', 'Group: g', '—', 'Move to window', 'Close', '—', 'More options…'])
    assert.deepStrictEqual(labels(items[0].submenu), ['Tabby Files', 'Explorer', 'VS Code'])
    assert.strictEqual(items.at(-1).submenu, more, 'More options… holds Tabby\'s whole menu as it is')
    ;[...items[0].submenu, ...items.filter(i => i.click)].forEach(i => i.click())
    assert.deepStrictEqual(called, [['files', tmp], ['open', tmp], ['code', tmp], ['rename'], ['pin'], ['duplicate'], ['copy', tmp], ['close']])
    items = smallMenu({ cwd: tmp, files: false, code: false, manager: 'Finder', pinned: true, toGroup: { label: 'Add to group' }, group: null, moveToWindow: { label: 'Move to window' }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open in', '—', 'Add to group', 'Rename', 'Unpin', 'Duplicate', 'Copy path', '—', 'Move to window', 'Close', '—', 'More options…'], 'no group, pinned')
    assert.deepStrictEqual(labels(items[0].submenu), ['Finder'], 'no tabby-files, no VS Code, macOS')
    assert.strictEqual(smallMenu({ cwd: tmp, closable: false, more }, act).find(i => i.label === 'Close').enabled, false, 'a pinned tab: Close is off')
    items = smallMenu({ cwd: null, more }, act)
    assert.strictEqual(items[0].enabled, false, 'no known folder: Open in is off')
    assert.strictEqual(items.find(i => i.label === 'Copy path').enabled, false)

    // The group menu (the header's and the tab menu's "Group:"): colours with the current one checked; Move group into
    // only when there is somewhere to go; a nested group ungroups a level; Close group with a tab under it, else Delete.
    const gCalled = []
    const gAct = Object.fromEntries(['color', 'rename', 'collapse', 'pin', 'moveInto', 'ungroup', 'close', 'remove'].map(k => [k, x => gCalled.push(x === undefined ? [k] : [k, x])]))
    const colors = [{ name: 'Red', value: '#f00' }, { name: 'Blue', value: '#00f' }]
    let g = groupMenu({ color: '#00f', colors, shut: false, pinned: false, parent: null, targets: [], hasTabs: true }, gAct)
    assert.deepStrictEqual(labels(g), ['Color', '—', 'Rename group', 'Collapse group', 'Pin group', '—', 'Ungroup', 'Close group'])
    assert.deepStrictEqual(g[0].submenu.map(c => [c.label, c.checked]), [['No color', false], ['Red', false], ['Blue', true]])
    ;[...g[0].submenu, ...g.filter(i => i.click)].forEach(i => i.click())
    assert.deepStrictEqual(gCalled, [['color', null], ['color', '#f00'], ['color', '#00f'], ['rename'], ['collapse'], ['pin'], ['ungroup'], ['close']])
    g = groupMenu({ color: null, colors, shut: true, pinned: true, parent: 'p', targets: [{ id: 'p', label: 'P' }, { id: 'q', label: 'Q' }], hasTabs: false }, gAct)
    assert.deepStrictEqual(labels(g), ['Color', '—', 'Rename group', 'Expand group', 'Unpin group', 'Move group into', '—', 'Ungroup (move up a level)', 'Delete group'])
    const into = g.find(i => i.label === 'Move group into').submenu
    assert.deepStrictEqual(into.map(t => [t.label, t.checked]), [['Top level', false], ['P', true], ['Q', false]])
    gCalled.length = 0
    ;[into[0], into[2], g.at(-1)].forEach(i => i.click())
    assert.deepStrictEqual(gCalled, [['moveInto', null], ['moveInto', 'q'], ['remove']])
    g = groupMenu({ colors, parent: null, targets: [{ id: 'q', label: 'Q' }], hasTabs: true }, gAct)
    assert.ok(labels(g).includes('Move group into'), 'top level with a group to move into')

    // VS Code: on Windows, Code.exe beside the bin folder that has code.cmd; elsewhere the code script on PATH.
    const bin = path.join(tmp, 'VS Code', 'bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'code.cmd'), '')
    assert.strictEqual(findCode({ PATH: bin }, true), null, 'code.cmd without Code.exe: none')
    fs.writeFileSync(path.join(tmp, 'VS Code', 'Code.exe'), '')
    assert.strictEqual(findCode({ PATH: [path.join(tmp, 'nope'), bin].join(path.delimiter) }, true), path.join(tmp, 'VS Code', 'Code.exe'))
    fs.writeFileSync(path.join(bin, 'code'), '')
    assert.strictEqual(findCode({ PATH: bin }, false), path.join(bin, 'code'))
    assert.strictEqual(findCode({ PATH: '' }, false), null)
} finally {
    fs.rmSync(tmp, { recursive: true, force: true })
}
console.log('test-tabmenu: all passed')
