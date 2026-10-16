/**
 * The command that brings a Claude Code or Codex session back after Tabby restarts (Tabby restores the shell and its
 * screen text, never the program). Keeps every launch flag of the original command (several --add-dir, the permission
 * mode, the model, …); drops the first prompt and the old resume, continue, name and print flags. A known session id
 * wins over the name, and --continue ("latest session in this folder") is the last resort: several sessions can share a folder.
 */
function resumeCommand (app, raw, sessionId, isWin = process.platform === 'win32') {
    if (app === 'codex') {
        return 'codex resume --last'
    }
    if (app !== 'claude' || !raw) {
        return null
    }
    const quote = v => shellQuote(v, isWin)
    const args = (raw.match(/"[^"]*"|\S+/g) ?? []).map(a => a.replace(/^"|"$/g, ''))
    // Drop the program itself: claude.exe, or node plus the CLI script.
    const start = args.findIndex(a => /claude(\.exe|\.cmd|\.ps1)?$|claude-code[\\/].*\.(m?js)$/i.test(a)) + 1
    const rest = args.slice(start)
    const keep = []
    let name
    for (let i = 0; i < rest.length; i++) {
        const eq = rest[i].startsWith('--') ? rest[i].indexOf('=') : -1
        const flag = eq > 0 ? rest[i].slice(0, eq) : rest[i]
        if (!flag.startsWith('-')) {
            continue // a bare word: the first prompt
        }
        let value = eq > 0 ? rest[i].slice(eq + 1) : undefined
        // An unknown flag may take a value or not. Dropping it with the next word is safe either way: that word is its
        // value or the first prompt, and the prompt is dropped anyway.
        const isSwitch = CLAUDE_SWITCHES.includes(flag)
        if (value === undefined && !isSwitch && rest[i + 1] && !rest[i + 1].startsWith('-')) {
            value = rest[++i]
        }
        if (['--resume', '-r', '--name', '-n'].includes(flag)) {
            name ??= value
        } else if (CLAUDE_KEPT_VALUE_FLAGS.includes(flag) || (isSwitch && !CLAUDE_DROPPED_SWITCHES.includes(flag))) {
            keep.push(flag, ...value === undefined ? [] : [quote(value)])
        }
    }
    return ['claude', ...sessionId || name ? ['--resume', quote(sessionId || name)] : ['--continue'], ...keep].join(' ')
}
// A resume keeps only the Claude flags listed here; any other flag is dropped, and a bare word is the first prompt.
const CLAUDE_KEPT_VALUE_FLAGS = ['--model', '--fallback-model', '--permission-mode', '--add-dir', '--settings',
    '--setting-sources', '--mcp-config', '--append-system-prompt', '--system-prompt', '--allowedTools', '--allowed-tools',
    '--disallowedTools', '--disallowed-tools', '--agents', '--agent', '--plugin-dir', '--max-turns', '--effort', '--betas',
    '--permission-prompt-tool']
// Flags without a value. The dropped ones would print and exit, or fork or continue another session.
const CLAUDE_SWITCHES = ['--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', '--verbose', '--debug', '-d',
    '--ide', '--strict-mcp-config', '--chrome', '--no-chrome', '--continue', '-c', '--print', '-p', '--fork-session']
const CLAUDE_DROPPED_SWITCHES = ['--continue', '-c', '--print', '-p', '--fork-session']
// The resume runs in PowerShell on Windows (see the recovery token), so a value with spaces or quotes is double-quoted there.
const shellQuote = (v, isWin = process.platform === 'win32') => /^[\w.:\\/=+-]+$/.test(v) ? v
    : isWin ? `"${v.replace(/[`"$]/g, '`$&')}"` : `'${v.replace(/'/g, `'\\''`)}'`

module.exports = { resumeCommand, shellQuote }
