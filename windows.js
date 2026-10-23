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
// A window that hears this publishes its bounds at once (a tab drag started somewhere).
const PING_KEY = 'tabby-groups:ping'
const STALE_MS = 15000

function createWindows ({ app, injector, core, recovery, top, aim, opened, isDisposed }) {
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
    // Overlapping windows: a drop goes to the one focused last, the likely top one.
    let focusedAt = document.hasFocus() ? Date.now() : 0
    // Screen point ↔ this window's client point. The outer bounds add the resize borders (Windows draws them outside
    // the window, invisible) on the sides and the bottom, and any native title bar on top; the page zoom scales the rest.
    const client = () => {
        const z = require('electron').webFrame.getZoomFactor()
        const side = (outerWidth - innerWidth * z) / 2
        return { x: screenX + side, y: screenY + outerHeight - innerHeight * z - side, w: innerWidth * z, h: innerHeight * z, z }
    }
    const toScreen = (x, y) => {
        const c = client()
        return { x: c.x + x * c.z, y: c.y + y * c.z }
    }
    const toClient = p => {
        const c = client()
        return { clientX: (p.x - c.x) / c.z, clientY: (p.y - c.y) / c.z }
    }
    const publish = () => {
        const { x, y, w, h } = client()
        return store(WIN_PREFIX + id, { at: Date.now(), x, y, w, h, focusedAt })
    }
    const onFocus = () => {
        focusedAt = Date.now()
        publish()
    }

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
    function send (to, token, point) {
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
            if (!store(MOVE_PREFIX + nonce, { to, nonce, token, point })) {
                acks.get(nonce)({ ok: false, why: 'the tab is too large to hand over' })
            }
        })
    }

    const panesOf = token => token?.type === 'app:split-tab' ? (token.children ?? []).flatMap(panesOf) : [token]
    /**
     * Opens the token's tab here, unless `wanted()` turned false meanwhile; the tab, or null when it did not open.
     * `point` (screen) is where a dragged tab was dropped: the tab goes to the row there, aimed before the tab adds its own.
     */
    async function receive (token, wanted = () => true, point = null) {
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
        let intent = null
        try {
            intent = point && aim(toClient(point))
        } catch { }
        const tab = app.openNewTabRaw(params)
        settle(tab, intent)
        return tab
    }
    async function settle (tab, intent) {
        try {
            app.selectTab(tab)
            // A split tab adds its panes after Tabby announces the tab, so they are watched once they exist.
            await Promise.race([tab.initialized$?.toPromise(), wait(5000)])
            opened(tab, intent)
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
        if (e.key === PING_KEY) {
            isDisposed() || publish()
        } else if (e.key === ACK_KEY) {
            acks.get(m.nonce)?.(m)
        } else if (!isDisposed() && e.key.startsWith(MOVE_PREFIX) && m.to === id) {
            let answer = null
            try {
                // The source took the tab back when the key is gone (it gave up waiting): then this window stays out.
                const tab = await receive(m.token, () => localStorage.getItem(e.key) !== null, m.point)
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
    async function move (tab, to, point = null) {
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
            const answer = await send(target.id, token, point)
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
    window.addEventListener('focus', onFocus)

    /*
     * A tab dragged out of the window: Tabby's tab drag keeps the pointer while the button is down, also outside the
     * window. Dropped over another Tabby window, the tab moves there; dropped outside every window, it gets a new one.
     */
    let drag = null
    let outsideDrop = null
    const isOutside = d => d.x !== null && !(d.x >= 0 && d.y >= 0 && d.x < innerWidth && d.y < innerHeight)
    /** True for a tab dropped (or being dropped: Tabby's split drop can come before the drag's end) outside the window. */
    const droppedOutside = tab => (drag?.tab === tab && isOutside(drag)) || (outsideDrop?.tab === tab && Date.now() < outsideDrop.until)
    const onDragPointer = e => { Object.assign(drag, { x: e.clientX, y: e.clientY }) }
    const onDragKey = e => { if (e.key === 'Escape') { drag.cancelled = true } }
    function dragStart (tab) {
        dragEnd(false)
        outsideDrop = null
        if (!app.tabs.includes(tab)) {
            return
        }
        drag = { tab, x: null, y: null, cancelled: false }
        store(PING_KEY, Date.now())
        document.addEventListener('pointermove', onDragPointer, true)
        document.addEventListener('keydown', onDragKey, true)
    }
    /** Ends the drag; returns the move under way when the tab was dropped outside the window. */
    function dragEnd (drop = true) {
        document.removeEventListener('pointermove', onDragPointer, true)
        document.removeEventListener('keydown', onDragKey, true)
        const d = drag
        drag = null
        if (!drop || !d || !isOutside(d)) {
            return null
        }
        // Tabby's own handling of this drop can also come after the drag's end.
        outsideDrop = { tab: d.tab, until: Date.now() + 3000 }
        if (d.cancelled) {
            return null
        }
        const p = toScreen(d.x, d.y)
        const [hit] = windows().filter(w => !w.me && p.x >= w.x && p.x < w.x + w.w && p.y >= w.y && p.y < w.y + w.h)
            .sort((a, b) => (b.focusedAt ?? 0) - (a.focusedAt ?? 0))
        // A drop on this window's own title bar or border, or one that slipped just past its edge, is no tear-off.
        const near = 16
        if (!hit && p.x >= screenX - near && p.x < screenX + outerWidth + near && p.y >= screenY - near && p.y < screenY + outerHeight + near) {
            return null
        }
        return move(d.tab, hit ? hit.n : 'new', hit ? p : null)
    }

    // The window's entry stays on a plugin reload: the next copy publishes the same id. A move under way still gets
    // its answer here, so the storage listener goes once the last one is over.
    function dispose () {
        stopped = true
        clearInterval(beat)
        window.removeEventListener('beforeunload', onUnload)
        window.removeEventListener('focus', onFocus)
        dragEnd(false)
        if (!acks.size) {
            window.removeEventListener('storage', onStorage)
        }
    }

    return { windows, move, dragStart, dragEnd, droppedOutside, dispose }
}

module.exports = { createWindows }
