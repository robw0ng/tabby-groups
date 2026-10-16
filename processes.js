// What runs in a tab: its process list, which app and shell that is, and the folder it works in.
const IS_WIN = process.platform === 'win32'

let processTree = null
try {
    processTree = require('@tabby-gang/windows-process-tree')
} catch { }
const SHELLS = { 'pwsh.exe': 'pwsh', 'powershell.exe': 'powershell', 'cmd.exe': 'cmd', 'bash.exe': 'bash', 'wsl.exe': 'wsl', pwsh: 'pwsh', bash: 'bash', zsh: 'bash', fish: 'bash', sh: 'bash' }
// First match wins over every process under the shell. AI CLIs come first, so one running on Node is not shown as Node.js.
const APPS = [
    ['claude', p => p.name.startsWith('claude') || p.cmd.includes('@anthropic-ai/claude-code')],
    ['codex', p => p.name.startsWith('codex') || p.cmd.includes('@openai/codex')],
    ['gemini', p => p.name.startsWith('gemini') || p.cmd.includes('@google/gemini-cli')],
    ['nvim', p => p.name.startsWith('nvim')],
    ['vim', p => /^g?vim(\.exe)?$/.test(p.name)],
    ['docker', p => p.name.startsWith('docker')],
    ['ssh', p => p.name === 'ssh.exe' || p.name === 'ssh'],
    ['python', p => /^python[0-9.]*(\.exe)?$|^py\.exe$/.test(p.name)],
    ['node', p => p.name === 'node.exe' || p.name === 'node'],
]
// Claude Code prefixes its title with ✳ when idle and a spinner (braille dots or ◐◑◒◓) while busy;
// this catches it when the process tree is unavailable.
const CLAUDE_TITLE = /^[⠀-⣿✳✻✽✶✢◐◑◒◓]/

const shellOf = command => SHELLS[(command ?? '').split(/[\\/]/).pop().toLowerCase()] ?? null

/** The session a running Claude Code process holds: Claude records it in sessions/<pid>.json under its config folder. */
function claudeSessionId (pid) {
    try {
        const dir = process.env.CLAUDE_CONFIG_DIR || require('path').join(require('os').homedir(), '.claude')
        const id = JSON.parse(require('fs').readFileSync(require('path').join(dir, 'sessions', pid + '.json'), 'utf8')).sessionId
        return /^[0-9a-f-]{36}$/i.test(id) ? id : null
    } catch {
        return null
    }
}

// One ps call per inspect, parsed by columns; a process name with a space (rare) lands in the command line.
const execText = (cmd, args) => new Promise(resolve => require('child_process').execFile(cmd, args, { timeout: 3000 }, (err, out) => resolve(err ? '' : out)))
async function psTree (root) {
    const nodes = new Map()
    for (const line of (await execText('ps', ['-A', '-o', 'pid=,ppid=,ucomm=,args='])).split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line)
        if (m) {
            nodes.set(+m[1], { pid: +m[1], ppid: +m[2], name: m[3].replace(/^-/, ''), commandLine: m[4], children: [] })
        }
    }
    nodes.forEach(n => nodes.get(n.ppid)?.children.push(n))
    return nodes.get(root) ?? null
}

let nativeCwd = null
try {
    nativeCwd = require('native-process-working-directory')
} catch { }
async function osCwd (pid) {
    if (!IS_WIN) {
        const dir = (await execText('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])).split('\n').find(l => l.startsWith('n'))
        return dir ? dir.slice(1) : null
    }
    try {
        const dir = nativeCwd?.getWorkingDirectoryFromPID(pid)
        return dir ? dir.replace(/\\+$/, '').replace(/^([a-z]:)$/i, '$1\\') : null
    } catch {
        return null
    }
}

// Default prompts of PowerShell (PS C:\x>), cmd (C:\x>) and Git Bash (… MINGW64 /c/x).
const PROMPTS = [
    [/^PS ([a-z]:\\[^>]*)>/i, m => m[1]],
    [/^([a-z]:\\[^>]*)>/i, m => m[1]],
    // Inside a git repo Git Bash appends " (branch)" to the prompt.
    [/MINGW(?:64|32)? (\/[a-z](?:\/[^\s(]*)?|~[^\s(]*)(?=\s|$)/i, m => m[1].startsWith('~')
        ? (process.env.USERPROFILE ?? '') + m[1].slice(1).replace(/\//g, '\\')
        : m[1][1].toUpperCase() + ':\\' + m[1].slice(3).replace(/\//g, '\\')],
]

/** The folder in the last shell prompt on screen, or null for a tab without a terminal view yet. */
function promptCwd (term) {
    const buffer = term.frontend?.xterm?.buffer?.active
    if (!buffer) {
        return null
    }
    const bottom = buffer.baseY + buffer.cursorY
    for (let y = bottom; y >= Math.max(0, bottom - 300); y--) {
        const line = buffer.getLine(y)?.translateToString(true).trim()
        for (const [re, toPath] of PROMPTS) {
            const m = line && re.exec(line)
            if (m) {
                return toPath(m).replace(/\\+$/, '').replace(/^([a-z]:)$/i, '$1\\')
            }
        }
    }
    return null
}

/*
 * "Running in background", from the process tree only. Claude runs a Bash command as its direct child
 * `bash -c "source …/shell-snapshots/… eval '<command>' …"`, and a PowerShell command as `cmd /c "… pwsh … -Command …
 * CLAUDE_CODE_SHELL_LAUNCHER_SCRIPT …"`. Such a child alive while Claude is not busy is a background task; it exits
 * with the task, while a daemon the task left behind is no such child. Never open a task's output file to test it: an
 * exclusive open breaks Claude's own read of that file (EBUSY).
 */
const taskShells = (procs, claudePid) => procs.filter(p => p.ppid === claudePid && (
    (/^(ba|z)?sh(\.exe)?$/.test(p.name) && p.raw.includes('shell-snapshots') && p.raw.includes("eval '"))
    || p.raw.includes('CLAUDE_CODE_SHELL_LAUNCHER_SCRIPT')))
/** The task's command, from its eval '…' (Bash); a PowerShell command keeps its script in the environment. */
const taskLabel = p => {
    const m = /eval '((?:[^']|'\\'')*)'/.exec(p.raw)
    return m ? m[1].replace(/'\\''/g, "'").replace(/\s+/g, ' ').trim().slice(0, 24) : 'PowerShell'
}

/** The processes under a tab's shell (the shell first), each { pid, ppid, name, cmd (lower case), raw }. */
async function processList (pid) {
    if (!pid || (IS_WIN && !processTree)) {
        return []
    }
    const tree = IS_WIN
        ? await new Promise(resolve => processTree.getProcessTree(pid, resolve, processTree.ProcessDataFlag.CommandLine))
        : await psTree(pid)
    const walk = (n, ppid) => n ? [{ pid: n.pid, ppid, name: n.name.toLowerCase(), cmd: (n.commandLine ?? '').toLowerCase(), raw: n.commandLine ?? '' }, ...n.children.flatMap(c => walk(c, n.pid))] : []
    return walk(tree, null)
}

module.exports = { SHELLS, APPS, CLAUDE_TITLE, shellOf, claudeSessionId, processList, execText, osCwd, promptCwd, taskShells, taskLabel }
