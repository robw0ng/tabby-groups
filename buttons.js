const IS_WIN = process.platform === 'win32'

/** The user's toolbar buttons, their background runs, the result card, and reloads started from it. */
function createButtons ({ open, drawIcon, hideTip, isDisposed }) {
    let userButtons = []

    /*
     * The user's toolbar buttons: tabby-groups.json "buttons": [{ "label", "command", "cwd"?, "check"?, "checkEveryMinutes"?,
     * and an icon: "icon" (a Font Awesome name such as "sync"), or "emoji", or "path"/"paths" (+ "stroke", "color") as in
     * "icons" }]. A click types the command into a new tab that stays open. With "check", the button shows only while the
     * check (run from Tabby's own process at start and every checkEveryMinutes, default 30) exits 10; its stdout is the
     * tooltip, and ✕ hides it until that stdout changes. Exit 0 means nothing new; any other exit is logged.
     * Tabby reads its own toolbar once at start, so the plugin draws these buttons itself.
     */
    const buttonState = new Map()
    let buttonTimers = []
    const sha1 = s => require('crypto').createHash('sha1').update(s).digest('hex')
    const dismissKey = b => 'tabby-groups:dismissed:' + sha1(b.label)
    /**
     * Runs a button's command line from Tabby's own process. Windows: cmd, with the console in UTF-8 (a piped console
     * program writes in the OEM code page otherwise). macOS and Linux: the user's login shell, because a Tabby started
     * from the Dock has launchd's bare PATH (no Homebrew, no npm globals).
     */
    function runShell (commandLine, { cwd, timeout }, done) {
        const opts = { cwd: cwd || require('os').homedir(), maxBuffer: 64 << 20, windowsHide: true, detached: !IS_WIN }
        const cp = require('child_process')
        const child = IS_WIN
            ? cp.exec(`chcp 65001 >nul & ${commandLine}`, opts, finish)
            : cp.execFile(process.env.SHELL || '/bin/zsh', ['-lc', commandLine], opts, finish)
        // A timeout ends the whole process tree; killing only the shell would leave the command running on its own.
        const timer = setTimeout(() => {
            try {
                IS_WIN ? cp.execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => { }) : process.kill(-child.pid, 'SIGTERM')
            } catch { }
        }, timeout)
        function finish (...result) {
            clearTimeout(timer)
            done(...result)
        }
    }
    function runCheck (b) {
        runShell(b.check, { cwd: b.cwd, timeout: 5 * 60e3 }, (err, stdout, stderr) => {
            if (isDisposed()) {
                return
            }
            const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
            if (code !== 0 && code !== 10) {
                console.warn('tabby-groups: button check failed', b.label, code, String(stderr || err?.message).trim())
            }
            buttonState.set(b.label, code === 10 ? stdout.replace(/\r/g, '').trim() : null)
            renderButtons()
        })
    }
    function scheduleChecks () {
        buttonTimers.forEach(clearInterval)
        buttonState.clear()
        buttonTimers = userButtons.filter(b => b.check).map(b => {
            runCheck(b)
            return setInterval(() => runCheck(b), Math.max(1, +b.checkEveryMinutes || 30) * 60e3)
        })
    }
    /*
     * A button with a check is an update: its command runs in the background from Tabby's own process, the icon spins, and
     * a toast tells the result. The full output goes to a log file the toast can open. If the command's last line is a JSON
     * object, "problems" (lines to look at) and "reload" (Tabby plugins that changed) shape the toast, and every other
     * non-empty field is shown as a line. A button without a check opens a tab, as before.
     */
    const running = new Set()
    const buttonLog = b => require('path').join(require('os').tmpdir(), 'tabby-groups', `button-${sha1(b.label).slice(0, 8)}.log`)
    function lastJson (stdout) {
        const line = stdout.replace(/\r/g, '').trim().split('\n').pop() ?? ''
        try {
            const v = JSON.parse(line)
            return v && typeof v === 'object' && !Array.isArray(v) ? v : null
        } catch {
            return null
        }
    }
    function runInBackground (b) {
        if (running.has(b.label)) {
            return
        }
        running.add(b.label)
        hideToast()
        renderButtons()
        runShell(b.command, { cwd: b.cwd, timeout: 30 * 60e3 }, (err, stdout, stderr) => {
            running.delete(b.label)
            if (isDisposed()) {
                return
            }
            const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
            // Done: the update the check reported is applied; hide the button until the check runs again.
            if (code === 0) {
                buttonState.delete(b.label)
            }
            const log = buttonLog(b)
            try {
                require('fs').mkdirSync(require('path').dirname(log), { recursive: true })
                require('fs').writeFileSync(log, `$ ${b.command}\n${new Date().toISOString()}\n\n${stdout}${stderr ? '\n--- stderr ---\n' + stderr : ''}\n--- exit ${code} ---\n`)
            } catch { }
            const json = lastJson(stdout)
            const result = json ?? {}
            const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(String)
            const problems = list(result.problems)
            const reload = list(result.reload)
            // A text field is a sentence of its own; a list gets its key as a label. Without JSON, the output's last lines.
            const notes = json
                ? Object.entries(result).filter(([k, v]) => !['problems', 'reload', 'sync'].includes(k) && list(v).length)
                    .map(([k, v]) => (typeof v === 'string' ? v : `${k}: ${list(v).join(', ')}`))
                : (stdout + stderr).replace(/\r/g, '').trim().split('\n').filter(Boolean).slice(-3)
            if (code !== 0) {
                showToast(`${b.label} failed (exit ${code})`, [...problems, ...notes], [['Open log', () => openLog(log)]])
            } else if (problems.length) {
                showToast(`${b.label}: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, [...problems, ...notes], [['Open log', () => openLog(log)]])
            } else if (reload.length) {
                showToast(`${b.label}: updated`, [`Changed: ${reload.join(', ')}`, ...notes], reloadActions(reload, log))
            } else {
                showToast(`${b.label}: up to date ✓`, notes, [['Open log', () => openLog(log)]], notes.length ? 0 : 6000)
            }
            renderButtons()
            if (b.check) {
                runCheck(b)
            }
        })
    }
    /*
     * Reload in place, the contract shared with tabby-remote: a plugin "tabby-x" puts window.__tabbyX = { reload(), dispose() }
     * on the page; reload() drops its own require cache and installs again, and install() disposes the old copy first.
     * A plugin without reload() needs a Tabby restart, and so does a change to a plugin's Angular providers.
     */
    const pluginGlobal = name => '__' + name.replace(/-(\w)/g, (m, c) => c.toUpperCase())
    const canReload = name => typeof window[pluginGlobal(name)]?.reload === 'function'
    function reloadActions (names, log) {
        const stuck = names.filter(n => !canReload(n))
        return [['Open log', () => openLog(log)],
            ...stuck.length < names.length ? [['Reload plugins', () => reloadPlugins(names.filter(canReload))]] : [],
            ...stuck.length ? [[`Restart Tabby to load ${stuck.join(', ')}`, null]] : []]
    }
    /** Reloads the plugins, this one last (its reload ends this copy); the next copy shows the result. */
    async function reloadPlugins (names) {
        const done = [], failed = []
        for (const n of [...names].sort((a, b) => (a === 'tabby-groups') - (b === 'tabby-groups'))) {
            if (n === 'tabby-groups') {
                window.__tgAfterReload = { done: [...done, n], failed }
            }
            try {
                await window[pluginGlobal(n)].reload()
                done.push(n)
            } catch (e) {
                console.warn('tabby-groups: reload failed', n, e)
                failed.push(n)
            }
        }
        // After its own successful reload this copy is disposed, and the new one reports.
        if (isDisposed()) {
            return
        }
        delete window.__tgAfterReload
        reportReload({ done, failed })
    }
    function reportReload ({ done, failed }) {
        showToast(failed.length ? 'Some plugins did not reload' : 'Plugins reloaded ✓',
            [...done.length ? [`Reloaded: ${done.join(', ')}`] : [], ...failed.length ? [`Restart Tabby to load ${failed.join(', ')}`] : []], [], failed.length ? 0 : 6000)
    }

    function openLog (file) {
        try {
            require('@electron/remote').shell.openPath(file)
        } catch (e) {
            console.warn('tabby-groups: cannot open', file, e.message)
        }
    }
    let toastEl = null
    let toastTimer = null
    function hideToast () {
        clearTimeout(toastTimer)
        toastEl?.remove()
        toastEl = null
    }
    /** A small card above the toolbar buttons: a title, lines, and actions (an action without a function is plain text). */
    function showToast (title, lines, actions = [], autoHide = 0) {
        hideToast()
        const bar = [...document.querySelectorAll('.tab-bar > .btn-group.background')].pop()?.getBoundingClientRect()
        toastEl = Object.assign(document.createElement('div'), { className: 'tg-toast' })
        toastEl.append(Object.assign(document.createElement('div'), { className: 'tg-toast-title', textContent: title }))
        for (const l of lines) {
            toastEl.append(Object.assign(document.createElement('div'), { className: 'tg-toast-line', textContent: l }))
        }
        const row = Object.assign(document.createElement('div'), { className: 'tg-toast-actions' })
        for (const [label, fn] of actions) {
            row.append(fn
                ? Object.assign(document.createElement('button'), { className: 'tg-toast-btn', textContent: label, onclick: () => { hideToast(); fn() } })
                : Object.assign(document.createElement('span'), { className: 'tg-toast-note', textContent: label }))
        }
        const close = Object.assign(document.createElement('button'), { className: 'tg-toast-btn tg-toast-x', textContent: '✕', onclick: hideToast })
        row.append(close)
        toastEl.append(row)
        if (bar) {
            Object.assign(toastEl.style, { left: Math.max(4, bar.left + 4) + 'px', bottom: Math.max(4, innerHeight - bar.top + 6) + 'px', maxWidth: Math.max(220, bar.width - 8) + 'px' })
        }
        document.body.append(toastEl)
        if (autoHide) {
            toastTimer = setTimeout(hideToast, autoHide)
        }
    }
    function pressButton (b) {
        if (b.check) {
            runInBackground(b)
        } else {
            open({ title: b.label, cwd: b.cwd || require('os').homedir(), run: b.command })
        }
    }
    const buttonsEl = Object.assign(document.createElement('div'), { className: 'tg-buttons' })
    function renderButtons () {
        const bar = [...document.querySelectorAll('.tab-bar > .btn-group.background')].pop()
        const shown = userButtons.filter(b => {
            const out = buttonState.get(b.label)
            if (!b.check || running.has(b.label)) {
                return true
            }
            let dismissed = null
            try {
                dismissed = localStorage.getItem(dismissKey(b))
            } catch { }
            return out != null && dismissed !== sha1(out)
        })
        if (!bar || !shown.length) {
            buttonsEl.remove()
            return
        }
        buttonsEl.replaceChildren(...shown.flatMap(b => {
            const out = buttonState.get(b.label)
            const busy = running.has(b.label)
            const btn = Object.assign(document.createElement('button'), { className: 'btn btn-secondary btn-tab-bar tg-button' + (b.check ? ' tg-update' : '') + (busy ? ' tg-running' : '') })
            btn.append(b.emoji || b.path || b.paths
                ? drawIcon({ emoji: b.emoji, path: b.path, paths: b.paths, stroke: !!b.stroke, color: b.color ?? 'currentColor' })
                : Object.assign(document.createElement('i'), { className: `fas fa-${b.icon || 'terminal'}` }))
            // One icon at any side-bar width: "Update available" and the check's lines live in the tooltip.
            btn.dataset.tgTip = busy ? `${b.label}: running…` : b.check ? `Update available: ${b.label}\n${out}` : b.label
            btn.addEventListener('click', () => pressButton(b))
            if (!b.check || busy) {
                return [btn]
            }
            const x = Object.assign(document.createElement('button'), { className: 'btn btn-secondary btn-tab-bar tg-button-x', textContent: '✕' })
            x.dataset.tgTip = 'Dismiss until something new'
            x.addEventListener('click', () => {
                try {
                    localStorage.setItem(dismissKey(b), sha1(out))
                } catch { }
                hideTip()
                renderButtons()
            })
            return [btn, x]
        }))
        if (buttonsEl.parentElement !== bar) {
            bar.prepend(buttonsEl)
        }
    }
    const buttons = () => userButtons.map(b => ({ label: b.label, shown: buttonsEl.isConnected && [...buttonsEl.children].some(c => c.dataset.tgTip?.startsWith(b.label)) }))

    function setButtons (list) {
        userButtons = list
        scheduleChecks()
        renderButtons()
    }
    /** Puts the buttons back when Tabby has rebuilt its toolbar. */
    function mount () {
        if (userButtons.length && !buttonsEl.isConnected) {
            renderButtons()
        }
    }
    function dispose () {
        buttonTimers.forEach(clearInterval)
        buttonsEl.remove()
        hideToast()
    }
    return { setButtons, mount, list: buttons, reportReload, dispose }
}

module.exports = { createButtons }
