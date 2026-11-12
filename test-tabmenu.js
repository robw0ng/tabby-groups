// node test-tabmenu.js: checks the small tab menu (tabmenu.js) with no Tabby: its items, and where VS Code is.
// On screen: picker.e2e.mjs.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findCode, smallMenu } = require('./tabmenu')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-menu-'))
try {
    // Items, in order. "Open in" offers Tabby Files (with tabby-files), Explorer or Finder, and VS Code (with code);
    // Close group only in a group; the pin item names what it will do.
    const labels = items => items.map(i => i.type === 'separator' ? '—' : i.label)
    const called = []
    const act = Object.fromEntries(['files', 'open', 'code', 'rename', 'pin', 'duplicate', 'copy', 'closeGroup'].map(k => [k, x => called.push(x === undefined ? [k] : [k, x])]))
    const more = [{ label: 'Duplicate' }]
    let items = smallMenu({ cwd: tmp, files: true, code: true, pinned: false, grouped: true, addToGroup: { label: 'Add to group', submenu: [] }, moveToWindow: { label: 'Move to window', submenu: [] }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open in', '—', 'Add to group', 'Rename', 'Pin', 'Duplicate', 'Copy path', '—', 'Move to window', 'Close group', '—', 'More options…'])
    assert.deepStrictEqual(labels(items[0].submenu), ['Tabby Files', 'Explorer', 'VS Code'])
    assert.strictEqual(items.at(-1).submenu, more, 'More options… holds Tabby\'s whole menu as it is')
    ;[...items[0].submenu, ...items.filter(i => i.click)].forEach(i => i.click())
    assert.deepStrictEqual(called, [['files', tmp], ['open', tmp], ['code', tmp], ['rename'], ['pin'], ['duplicate'], ['copy', tmp], ['closeGroup']])
    items = smallMenu({ cwd: tmp, files: false, code: false, manager: 'Finder', pinned: true, grouped: false, moveToWindow: { label: 'Move to window' }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open in', '—', 'Rename', 'Unpin', 'Duplicate', 'Copy path', '—', 'Move to window', '—', 'More options…'], 'no group, pinned')
    assert.deepStrictEqual(labels(items[0].submenu), ['Finder'], 'no tabby-files, no VS Code, macOS')
    items = smallMenu({ cwd: null, more }, act)
    assert.strictEqual(items[0].enabled, false, 'no known folder: Open in is off')
    assert.strictEqual(items.find(i => i.label === 'Copy path').enabled, false)

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
