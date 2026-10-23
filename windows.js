/*
 * Moves a tab to another Tabby window with its shell still running. Tabby keeps every local PTY in its main process
 * and sends its output to every window, so the source window closes the tab without killing the PTY, and the target
 * window opens the tab again from its recovery token, which names the PTY.
 * Each window runs its own copy of this plugin. The windows share one localStorage, and a write in one fires "storage"
 * in the others: that carries each window's presence (Window 1 is the oldest) and the move itself.
 */
const WIN_PREFIX = 'tabby-groups:window:'
// One key per move (MOVE_PREFIX + nonce): the source removes it once the move is over, so a late target leaves it alone.
const MOVE_PREFIX = 'tabby-groups:move:'
const ACK_KEY = 'tabby-groups:move-ack'
const STALE_MS = 15000

function createWindows ({ app, injector, core, recovery, top, opened, isDisposed }) {
    // The time this page loaded: the same for every plugin copy in the window, and it orders the windows by age.
    const id = String(performance.timeOrigin)
    const wait = ms => new Promise(r => setTimeout(r, ms))
    const store = (key, value) => {
        try {
            value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value))
            return true
        } catch {
            return false
        }
    }
    const publish = () => store(WIN_PREFIX + id, { at: Date.now(), x: screenX, y: screenY, w: outerWidth, h: outerHeight })

    /** The open windows, oldest first: [{ id, n, me, x, y, w, h }]. A window that stopped publishing (it crashed) is dropped. */
    function windows () {
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
            keys.push(localStorage.key(i))
        }
        const out = []
        for (const key of keys.filter(k => k?.startsWith(WIN_PREFIX))) {
            const wid = key.slice(WIN_PREFIX.length)
            let w = null
            try {
                w = JSON.parse(localStorage.getItem(key))
            } catch { }
            if (wid === id || Date.now() - (w?.at ?? 0) < STALE_MS) {
                out.push({ ...w, id: wid })
            } else {
                store(key, null)
            }
        }
        return out.sort((a, b) => a.id - b.id).map((w, i) => ({ ...w, n: i + 1, me: w.id === id }))
    }

    async function newWindow () {
        const before = new Set(windows().map(w => w.id))
        injector.get(core.HostAppService).newWindow()
        for (let i = 0; i < 60 && !isDisposed(); i++) {
            await wait(250)
            const w = windows().find(x => !before.has(x.id))
            if (w) {
                return w
            }
        }
        return null
    }

    const { ipcRenderer } = require('electron')
    const acks = new Map()
    let stopped = false
    /** Hands the token to window `to`; resolves to its answer, or to a refusal when it does not answer. */
    function send (to, token) {
        const nonce = id + '-' + Math.random().toString(36).slice(2)
        return new Promise(resolve => {
            const timer = setTimeout(() => acks.get(nonce)?.({ ok: false, why: 'it did not answer' }), 10000)
            acks.set(nonce, answer => {
                clearTimeout(timer)
                acks.delete(nonce)
                store(MOVE_PREFIX + nonce, null)
                if (stopped && !acks.size) {
                    window.removeEventListener('storage', onStorage)
                }
                resolve(answer)
            })
            if (!store(MOVE_PREFIX + nonce, { to, nonce, token })) {
                acks.get(nonce)({ ok: false, why: 'the tab is too large to hand over' })
            }
        })
    }

    const panesOf = token => token?.type === 'app:split-tab' ? (token.children ?? []).flatMap(panesOf) : [token]
    /** Opens the token's tab here, unless `wanted()` turned false meanwhile; the tab, or null when it did not open. */
    async function receive (token, wanted = () => true) {
        // A pane whose PTY still runs goes on as it is. One whose PTY ended starts a new shell, which then types its
        // Claude or Codex resume command (the token's tabbyResume, as after a restart).
        for (const pane of panesOf(token)) {
            const pty = pane?.profile?.options?.restoreFromPTYID
            if (pty && ipcRenderer.sendSync('pty:exists', pty)) {
                delete pane.tabbyResume
            }
        }
        const params = await recovery.recoverTab(token)
        if (!params || !wanted()) {
            return null
        }
        const tab = app.openNewTabRaw(params)
        settle(tab)
        return tab
    }
    async function settle (tab) {
        try {
            app.selectTab(tab)
            // A split tab adds its panes after Tabby announces the tab, so they are watched once they exist.
            await Promise.race([tab.initialized$?.toPromise(), wait(5000)])
            opened(tab)
        } catch (err) {
            console.warn('tabby-groups: a moved tab opened, but', err)
        }
    }

    async function onStorage (e) {
        if (!e.newValue) {
            return
        }
        let m = null
        try {
            m = JSON.parse(e.newValue)
        } catch {
            return
        }
        // A copy that a reload replaced still hears the answers to its own moves, and nothing else.
        if (e.key === ACK_KEY) {
            acks.get(m.nonce)?.(m)
        } else if (!isDisposed() && e.key.startsWith(MOVE_PREFIX) && m.to === id) {
            let answer = null
            try {
                // The source took the tab back when the key is gone (it gave up waiting): then this window stays out.
                const tab = await receive(m.token, () => localStorage.getItem(e.key) !== null)
                answer = tab ? { ok: true } : localStorage.getItem(e.key) === null ? null : { ok: false, why: 'Tabby could not restore the tab' }
            } catch (err) {
                answer = { ok: false, why: String(err?.message ?? err) }
            }
            if (answer) {
                store(ACK_KEY, { nonce: m.nonce, ...answer })
            }
        }
    }

    /**
     * Moves `tab` (a whole split tab) to window `to`: its number in windows(), or 'new'. Its group, colour, parent, pin
     * and Claude state go with it. Returns { ok, window } or { ok: false, why }; on a failure the tab stays here.
     */
    async function move (tab, to) {
        tab = top(tab)
        if (!app.tabs.includes(tab)) {
            return { ok: false, why: 'no such tab' }
        }
        if (app.tabs.length === 1 && injector.get(core.ConfigService).store.appearance?.lastTabClosesWindow) {
            return { ok: false, why: 'it is the last tab here, and Tabby closes a window without tabs (Settings → Appearance)' }
        }
        const target = to === 'new' ? await newWindow() : windows().find(w => w.n === Number(to))
        if (!target) {
            return { ok: false, why: to === 'new' ? 'the new window did not start' : `no window ${to}` }
        }
        if (target.me) {
            return { ok: false, why: `the tab is in window ${target.n} already` }
        }
        const panes = tab.getAllTabs?.() ?? [tab]
        const ptys = panes.map(p => p.session?.getID?.()).filter(Boolean)
        let token = null
        let keepAlive = []
        try {
            // The recovery hook in index.js adds each pane's state (kind, folder, Claude state) to a moving tab's token.
            ;[tab, ...panes].forEach(p => { p.__tgMoving = true })
            try {
                token = await recovery.getFullRecoveryToken(tab, { includeState: true })
            } finally {
                ;[tab, ...panes].forEach(p => { delete p.__tgMoving })
            }
            if (!token) {
                return { ok: false, why: 'Tabby cannot move this kind of tab' }
            }
            // Closing the tab destroys its sessions, which drops their PTY listeners; only the kill is skipped.
            for (const pane of panes) {
                if (pane.session) {
                    pane.session.kill = () => { }
                    pane.session.gracefullyKillProcess = async () => { }
                }
            }
            await app.closeTab(tab, false, true)
            // While no window shows the PTYs, this window takes their output, or Tabby pauses a PTY with 500 KB unread.
            keepAlive = ptys.map(pty => [`pty:${pty}:data`, (_event, data) => ipcRenderer.send('pty:ack-data', pty, data.length)])
            keepAlive.forEach(([key, f]) => ipcRenderer.on(key, f))
            // "Reopen closed tab" must not open a second view of the PTYs.
            app.closedTabsStack = app.closedTabsStack.filter(t => !ptys.some(pty => JSON.stringify(t).includes(pty)))
            const answer = await send(target.id, token)
            if (answer.ok) {
                return { ok: true, window: target.n }
            }
            // The PTYs still run, so the tab comes back here as it was.
            if (await receive(token)) {
                return { ok: false, why: `window ${target.n}: ${answer.why}; the tab stayed here` }
            }
            throw new Error(`window ${target.n}: ${answer.why}, and the tab did not open here again`)
        } catch (err) {
            const lost = token && !app.tabs.includes(tab) ? `; its shell still runs without a tab (PTY ${ptys.join(', ')})` : ''
            return { ok: false, why: String(err?.message ?? err) + lost }
        } finally {
            keepAlive.forEach(([key, f]) => ipcRenderer.off(key, f))
        }
    }

    publish()
    const beat = setInterval(publish, 5000)
    const onUnload = () => store(WIN_PREFIX + id, null)
    window.addEventListener('storage', onStorage)
    window.addEventListener('beforeunload', onUnload)

    // The window's entry stays on a plugin reload: the next copy publishes the same id. A move under way still gets
    // its answer here, so the storage listener goes once the last one is over.
    function dispose () {
        stopped = true
        clearInterval(beat)
        window.removeEventListener('beforeunload', onUnload)
        if (!acks.size) {
            window.removeEventListener('storage', onStorage)
        }
    }

    return { windows, move, dispose }
}

module.exports = { createWindows }
