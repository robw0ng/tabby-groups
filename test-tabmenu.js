// node test-tabmenu.js: checks the small tab menu (tabmenu.js) with no Tabby: its items, where VS Code is, and a Claude
// session's repo from its transcript. On screen: picker.e2e.mjs.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { findCode, foldersIn, transcriptOf, sessionRepo, gitTop, menuRepo, smallMenu } = require('./tabmenu')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-menu-'))
try {
    // Items, in order. "Open in" and "Open repo in <name>" each offer Tabby Files (with tabby-files), Explorer or
    // Finder, and VS Code (with code); Close group only in a group; the pin item names what it will do.
    const labels = items => items.map(i => i.type === 'separator' ? '—' : i.label)
    const called = []
    const act = Object.fromEntries(['files', 'open', 'code', 'rename', 'pin', 'duplicate', 'copy', 'closeGroup'].map(k => [k, x => called.push(x === undefined ? [k] : [k, x])]))
    const more = [{ label: 'Duplicate' }]
    const repo = path.join(tmp, 'claude-stack')
    let items = smallMenu({ cwd: tmp, repo, files: true, code: true, mac: false, pinned: false, grouped: true, addToGroup: { label: 'Add to group', submenu: [] }, moveToWindow: { label: 'Move to window', submenu: [] }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open in', 'Open repo in claude-stack', '—', 'Add to group', 'Rename', 'Pin', 'Duplicate', 'Copy path', '—', 'Move to window', 'Close group', '—', 'More options…'])
    assert.deepStrictEqual(labels(items[0].submenu), ['Tabby Files', 'Explorer', 'VS Code'])
    assert.deepStrictEqual(labels(items[1].submenu), ['Tabby Files', 'Explorer', 'VS Code'])
    assert.strictEqual(items.at(-1).submenu, more, 'More options… holds Tabby\'s whole menu as it is')
    ;[...items[0].submenu, ...items[1].submenu, ...items.filter(i => i.click)].forEach(i => i.click())
    assert.deepStrictEqual(called, [['files', tmp], ['open', tmp], ['code', tmp], ['files', repo], ['open', repo], ['code', repo],
        ['rename'], ['pin'], ['duplicate'], ['copy', tmp], ['closeGroup']])
    items = smallMenu({ cwd: tmp, repo: null, files: false, code: false, manager: 'Finder', pinned: true, grouped: false, moveToWindow: { label: 'Move to window' }, more }, act)
    assert.deepStrictEqual(labels(items), ['Open in', '—', 'Rename', 'Unpin', 'Duplicate', 'Copy path', '—', 'Move to window', '—', 'More options…'], 'no repo, no group, pinned')
    assert.deepStrictEqual(labels(items[0].submenu), ['Finder'], 'no tabby-files, no VS Code, macOS')
    items = smallMenu({ cwd: null, more }, act)
    assert.strictEqual(items[0].enabled, false, 'no known folder: Open in is off')
    assert.strictEqual(items.find(i => i.label === 'Copy path').enabled, false)

    // The repo: a Claude tab's working repo, else the folder's git repo; none when it is the folder itself.
    const sub = path.join(tmp, 'work', 'src')
    assert.strictEqual(menuRepo({ cwd: sub, claudeRepo: repo, cwdRepo: path.join(tmp, 'work') }), repo, 'Claude: the session\'s repo wins')
    assert.strictEqual(menuRepo({ cwd: sub, claudeRepo: null, cwdRepo: path.join(tmp, 'work') }), path.join(tmp, 'work'), 'else the folder\'s repo')
    assert.strictEqual(menuRepo({ cwd: repo, claudeRepo: repo.toUpperCase(), cwdRepo: null }), null, 'the same folder: hidden')
    assert.strictEqual(menuRepo({ cwd: sub, claudeRepo: null, cwdRepo: null }), null, 'no repo: hidden')
    const root = path.parse(tmp).root
    assert.strictEqual(smallMenu({ cwd: tmp, repo: root, more }, act)[1].label, `Open repo in ${root}`, 'a repo at a drive root: its path')
    // gitTop asks git itself (no shell); outside a repo, null.
    let hasGit = true
    try {
        execFileSync('git', ['--version'], { stdio: 'ignore' })
    } catch {
        hasGit = false
    }
    if (hasGit) {
        const g = path.join(tmp, 'g')
        fs.mkdirSync(path.join(g, 'deep'), { recursive: true })
        execFileSync('git', ['init', '-q', g])
        assert.strictEqual(gitTop(path.join(g, 'deep')).toLowerCase(), fs.realpathSync(g).toLowerCase())
        assert.strictEqual(gitTop(path.join(tmp, 'nope')), null)
    }

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
