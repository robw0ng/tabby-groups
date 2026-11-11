// The small tab menu (index.js wraps Tabby's tab-header menu): its items, where VS Code is, and a Claude session's repo.
const fs = require('fs')
const path = require('path')
const os = require('os')

/**
 * VS Code found through `code` on PATH, as a program to start with no shell: on Windows `code` is bin\code.cmd, a
 * batch file, so this is Code.exe beside bin; elsewhere the `code` script itself. Null when there is none.
 */
function findCode (env = process.env, isWin = process.platform === 'win32') {
    for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) {
        if (isWin && fs.existsSync(path.join(dir, 'code.cmd'))) {
            const exe = path.join(dir, '..', 'Code.exe')
            if (fs.existsSync(exe)) {
                return path.resolve(exe)
            }
        } else if (!isWin && fs.existsSync(path.join(dir, 'code'))) {
            return path.join(dir, 'code')
        }
    }
    return null
}

// Git Bash writes C:\x as /c/x, and a shell path can start with ~.
function native (p, isWin = process.platform === 'win32') {
    if (p.startsWith('~')) {
        p = path.join(os.homedir(), p.slice(1))
    }
    return isWin ? p.replace(/^\/([a-z])(?=\/|$)/i, '$1:') : p
}

/** The folders a tool call names, as claude-sessions' peek reads them: a file's folder, or the dir of `git -C <dir>` / `cd <dir>`. */
function foldersIn (input) {
    const out = ['file_path', 'notebook_path', 'path'].map(k => input[k]).filter(v => typeof v === 'string')
    const m = typeof input.command === 'string' && input.command.match(/(?:git\s+-C|\bcd)\s+("[^"]+"|'[^']+'|[^\s;&|]+)/)
    if (m) {
        out.push(m[1].replace(/^["']|["']$/g, ''))
    }
    return out.map(p => native(p)).flatMap(p => {
        try {
            return [fs.statSync(p).isDirectory() ? p : path.dirname(p)]
        } catch {
            return []
        }
    })
}

/** The nearest folder at or above `dir` with a .git (a folder, or a worktree's file). */
function repoRoot (dir) {
    for (let d = path.resolve(dir); ; d = path.dirname(d)) {
        if (fs.existsSync(path.join(d, '.git'))) {
            return d
        }
        if (path.dirname(d) === d) {
            return null
        }
    }
}

/** A Claude Code session's transcript: <config>/projects/<folder>/<id>.jsonl. */
function transcriptOf (sessionId, configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')) {
    if (!/^[\w-]+$/.test(sessionId ?? '')) {
        return null
    }
    const projects = path.join(configDir, 'projects')
    try {
        for (const d of fs.readdirSync(projects)) {
            const f = path.join(projects, d, sessionId + '.jsonl')
            if (fs.existsSync(f)) {
                return f
            }
        }
    } catch { }
    return null
}

/**
 * The repo a Claude session works in, as peek finds it: the repo of the newest folder its tool calls named, from the
 * transcript's last 1 MB. The transcript is Claude Code's own format, so a line that does not parse is skipped.
 * ponytail: tries at most 20 different folders — raise it if sessions often end on many files outside any repo.
 */
function sessionRepo (file) {
    let text
    try {
        const fd = fs.openSync(file, 'r')
        try {
            const size = fs.fstatSync(fd).size
            const n = Math.min(size, 1 << 20)
            const buf = Buffer.alloc(n)
            fs.readSync(fd, buf, 0, n, size - n)
            text = buf.toString('utf8')
        } finally {
            fs.closeSync(fd)
        }
    } catch {
        return null
    }
    const lines = text.split('\n')
    const tried = new Set()
    for (let i = lines.length - 1; i >= 0; i--) {
        let e
        try {
            e = JSON.parse(lines[i])
        } catch {
            continue
        }
        if (e?.type !== 'assistant' || e.isSidechain || !Array.isArray(e.message?.content)) {
            continue
        }
        for (const p of [...e.message.content].reverse()) {
            for (const d of p?.type === 'tool_use' ? foldersIn(p.input ?? {}) : []) {
                if (tried.has(d)) {
                    continue
                }
                if (tried.size >= 20) {
                    return null
                }
                tried.add(d)
                const root = repoRoot(d)
                if (root) {
                    return root
                }
            }
        }
    }
    return null
}

const samePath = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()

/**
 * The small menu, in Tabby's menu item format. `cwd`: the tab's folder; `repo`: a Claude tab's repo (shown when it is
 * not the folder); `code`: whether VS Code is there; `addToGroup` / `moveToWindow`: the plugin's own submenus;
 * `more`: Tabby's full menu; `act`: { open(dir), code(dir), rename(), copy(text), closeGroup() }.
 */
function smallMenu ({ cwd, repo, code, grouped, addToGroup, moveToWindow, more }, act) {
    return [
        { label: 'Open folder', enabled: !!cwd, click: () => act.open(cwd) },
        ...code && cwd ? [{ label: 'Open in VS Code', click: () => act.code(cwd) }] : [],
        ...repo && !samePath(repo, cwd) ? [{ label: 'Open repo', click: () => act.open(repo) }] : [],
        { type: 'separator' },
        ...addToGroup ? [addToGroup] : [],
        { label: 'Rename', click: () => act.rename() },
        { label: 'Copy path', enabled: !!cwd, click: () => act.copy(cwd) },
        { type: 'separator' },
        ...moveToWindow ? [moveToWindow] : [],
        ...grouped ? [{ label: 'Close group', click: () => act.closeGroup() }] : [],
        { type: 'separator' },
        { label: 'More options…', submenu: more },
    ]
}

module.exports = { findCode, foldersIn, repoRoot, transcriptOf, sessionRepo, smallMenu }
