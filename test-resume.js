// node test-resume.js: checks the Claude resume command and its quoting (PowerShell on Windows, POSIX elsewhere).
const src = require('fs').readFileSync(__dirname + '/index.js', 'utf8')
const a = src.indexOf('    function resumeCommand'), b = src.indexOf('\n', src.indexOf('    const shellQuote'))
const load = isWin => new Function('IS_WIN', src.slice(a, b) + '\nreturn { resumeCommand, shellQuote }')(isWin)
const { resumeCommand } = load(true)
const exe = String.raw`"C:\Users\R\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"`
const cases = [
  [String.raw`${exe} --resume feature-x --add-dir C:\repo --add-dir C:\app --permission-mode acceptEdits`, String.raw`claude --resume feature-x --add-dir C:\repo --add-dir C:\app --permission-mode acceptEdits`],
  [`${exe} --resume d7a894c7-f7ff-49d7-b5ec-7c6aa0409d0b`, 'claude --resume d7a894c7-f7ff-49d7-b5ec-7c6aa0409d0b'],
  [`${exe} --dangerously-skip-permissions "fix the bug"`, 'claude --continue --dangerously-skip-permissions'],
  [`${exe} --effort high --model opus --name my-session`, 'claude --resume my-session --effort high --model opus'],
  [`${exe} --some-new-flag val --resume x`, 'claude --resume x'],
  [`${exe} --verbose "do it" --print`, 'claude --continue --verbose'],
  [`${exe} --session-id 1234 --fork-session -c`, 'claude --continue'],
  [`${exe} --name "x $(Remove-Item ~ -r)"`, 'claude --resume "x `$(Remove-Item ~ -r)"'],
  [`${exe} --append-system-prompt "a \`b"`, 'claude --continue --append-system-prompt "a ``b"'],
  [`${exe} --name @splat`, 'claude --resume "@splat"'],
]
let bad = 0
for (const [raw, want] of cases) { const got = resumeCommand('claude', raw); if (got !== want) { bad++; console.log('FAIL', raw.slice(exe.length), '\n  got ', got, '\n  want', want) } }
// macOS and Linux: POSIX single quotes.
const posix = load(false).resumeCommand
const posixCases = [
  [`${exe} --name "it's $(x)"`, String.raw`claude --resume 'it'\''s $(x)'`],
  ['/Users/r/.local/bin/claude --resume abc --add-dir /Users/r/core', 'claude --resume abc --add-dir /Users/r/core'],
]
for (const [raw, want] of posixCases) { const got = posix('claude', raw); if (got !== want) { bad++; console.log('FAIL posix', raw, '\n  got ', got, '\n  want', want) } }
console.log(bad ? bad + ' failed' : 'all ' + (cases.length + posixCases.length) + ' passed')
if (bad) process.exitCode = 1
