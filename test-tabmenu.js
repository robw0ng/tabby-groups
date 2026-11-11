// node test-tabmenu.js: checks the small tab menu (tabmenu.js) with no Tabby: its items, where VS Code is, and a Claude
// session's repo from its transcript. On screen: picker.e2e.mjs.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findCode, foldersIn, transcriptOf, sessionRepo, smallMenu } = require('./tabmenu')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-menu-'))
try {
    // Items, in order; Open in VS Code only with VS Code, Open repo only when it is not the folder, Close group only in a group.
    const labels = items => items.map(i => i.type === 'separator' ? '—' : i.label)
    const called = []
    const act = { open: d => called.push(['open', d]), code: d => called.push(['code', d]), rename: () => called.push(['rename']), copy: t => called.push(['copy', t]), closeGroup: () => called.push(['close']) }
    const more = [{ label: 'Duplicate' }]
    let items = smallMenu({ cwd: tmp, repo: path.join(tmp, '..'), code: true, grouped: true, addToGroup: { label: 'Add to group', submenu: [] }, moveToWindow: { label: 'Move to window', submenu: [] }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open folder', 'Open in VS Code', 'Open repo', '—', 'Add to group', 'Rename', 'Copy path', '—', 'Move to window', 'Close group', '—', 'More options…'])
    assert.strictEqual(items.at(-1).submenu, more, 'More options… holds Tabby\'s whole menu as it is')
    items.filter(i => i.click).forEach(i => i.click())
    assert.deepStrictEqual(called, [['open', tmp], ['code', tmp], ['open', path.join(tmp, '..')], ['rename'], ['copy', tmp], ['close']])
    items = smallMenu({ cwd: tmp, repo: tmp.toUpperCase(), code: false, grouped: false, more }, act)
    assert.deepStrictEqual(labels(items), ['Open folder', '—', 'Rename', 'Copy path', '—', '—', 'More options…'], 'no VS Code, repo = folder, no group')
    items = smallMenu({ cwd: null, more }, act)
    assert.strictEqual(items[0].enabled, false, 'no known folder: Open folder is off')
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

    // A Claude session's repo: the repo of the newest folder its tool calls named; bad lines are skipped.
    const repoA = path.join(tmp, 'repoA'), repoB = path.join(tmp, 'repoB')
    fs.mkdirSync(path.join(repoA, '.git'), { recursive: true })
    fs.mkdirSync(path.join(repoB, 'src'), { recursive: true })
    fs.writeFileSync(path.join(repoB, '.git'), 'gitdir: elsewhere')   // a worktree has a .git file
    fs.writeFileSync(path.join(repoB, 'src', 'x.js'), '')
    const use = input => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', input }] } })
    assert.deepStrictEqual(foldersIn({ file_path: path.join(repoB, 'src', 'x.js') }), [path.join(repoB, 'src')])
    assert.deepStrictEqual(foldersIn({ command: `git -C "${repoA}" status` }), [repoA])
    assert.deepStrictEqual(foldersIn({ path: path.join(tmp, 'gone') }), [])
    const projects = path.join(tmp, 'config', 'projects', 'C--x')
    fs.mkdirSync(projects, { recursive: true })
    const file = path.join(projects, 'abc-123.jsonl')
    fs.writeFileSync(file, [use({ command: `cd ${repoA} && ls` }), 'not json', use({ file_path: path.join(repoB, 'src', 'x.js') }),
        JSON.stringify({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', input: { path: repoA } }] } }), '{"type":"user"}', ''].join('\n'))
    assert.strictEqual(transcriptOf('abc-123', path.join(tmp, 'config')), file)
    assert.strictEqual(transcriptOf('../evil', path.join(tmp, 'config')), null, 'a session id is a name, not a path')
    assert.strictEqual(sessionRepo(file), repoB, 'the newest folder wins; a subagent\'s calls do not count')
    fs.writeFileSync(file, use({ file_path: path.join(os.tmpdir(), 'no-repo-here.txt') }))
    assert.strictEqual(sessionRepo(file), null)
    assert.strictEqual(sessionRepo(path.join(tmp, 'missing.jsonl')), null)
} finally {
    fs.rmSync(tmp, { recursive: true, force: true })
}
console.log('test-tabmenu: all passed')
