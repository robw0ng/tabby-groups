const { taskLabel } = require('./processes')

/** A Claude tab's state for the side bar and other front ends: busy, needs you, asking, compacting, background tasks. */
function createAgent ({ app, top, queueRender, inspect, isDisposed }) {
    /*
     * Claude's state from its title: a spinner (braille or ◐◑◒◓) while it works, ✳ while it waits for input. A tab that
     * goes from busy to waiting while nobody looks at it (not Tabby's focused active tab, not open on a device) needs you
     * until it is seen. Codex sets no such title, so it has no state.
     */
    const lookedAt = t => (app.activeTab === t && document.hasFocus()) || !!t.__trPresence?.some(d => d.state !== 'away')
    function updateAgent (term) {
        const info = term.__tgInfo
        if (!info) {
            return
        }
        const title = term.title ?? ''
        const prev = info.agent ?? null
        const state = info.kind !== 'claude' ? null : /^[⠀-⣿◐◑◒◓]/.test(title) ? 'busy' : /^✳/.test(title) ? 'waiting' : prev?.state ?? null
        if (state === (prev?.state ?? null)) {
            return
        }
        const t = top(term)
        info.agent = state && {
            // Asking replaces "needs you": a tab that asks shows only that.
            state, since: Date.now(), needsYou: state === 'waiting' && prev?.state === 'busy' && !info.asking && !lookedAt(t),
            asking: info.asking ?? null, background: state === 'busy' ? null : info.background ?? null, compacting: info.compacting ?? null,
        }
        syncAgent(t)
    }
    /*
     * "Asking": the tabby-groups Claude plugin's hooks write <config>/tabby-groups/asking/<session id>.json while Claude
     * waits on a question (AskUserQuestion) or a permission, and remove it when that is over. A pane knows its session id
     * from Claude's own sessions/<pid>.json, so the file maps to the pane; the folder is watched, not polled.
     */
    const askingDir = require('path').join(process.env.CLAUDE_CONFIG_DIR || require('path').join(require('os').homedir(), '.claude'), 'tabby-groups', 'asking')
    function readAsking (sessionId) {
        try {
            const a = JSON.parse(require('fs').readFileSync(require('path').join(askingDir, sessionId + '.json'), 'utf8'))
            // source "text": the turn ended with a question in plain text, not a menu.
            return ['question', 'permission'].includes(a.kind) ? { kind: a.kind, since: a.since, ...a.source === 'text' ? { source: 'text' } : {} } : null
        } catch {
            return null
        }
    }
    function setAsking (pane, asking) {
        const info = pane.__tgInfo
        if (!info || JSON.stringify(info.asking ?? null) === JSON.stringify(asking)) {
            return
        }
        info.asking = asking
        info.agent = info.agent
            ? { ...info.agent, asking, needsYou: info.agent.needsYou && !asking }
            : asking && { state: 'waiting', since: asking.since, needsYou: false, asking, compacting: info.compacting ?? null }
        syncAgent(top(pane))
    }
    /*
     * "Compacting": the same plugin's PreCompact hook writes <config>/tabby-groups/compacting/<session id>.json, and
     * PostCompact removes it. A file older than 10 minutes is stale (Claude died mid-compaction).
     */
    const compactingDir = require('path').join(require('path').dirname(askingDir), 'compacting')
    const COMPACT_MAX = 10 * 60e3
    function readCompacting (sessionId) {
        try {
            const c = JSON.parse(require('fs').readFileSync(require('path').join(compactingDir, sessionId + '.json'), 'utf8'))
            return Date.now() - c.since < COMPACT_MAX ? { trigger: c.trigger === 'auto' ? 'auto' : 'manual', since: c.since } : null
        } catch {
            return null
        }
    }
    function setCompacting (pane, compacting) {
        const info = pane.__tgInfo
        if (!info || JSON.stringify(info.compacting ?? null) === JSON.stringify(compacting)) {
            return
        }
        clearTimeout(pane.__tgCmpTimer)
        if (compacting) {
            pane.__tgCmpTimer = setTimeout(() => setCompacting(pane, null), compacting.since + COMPACT_MAX - Date.now())
        }
        info.compacting = compacting
        info.agent = info.agent
            ? { ...info.agent, compacting }
            : compacting && { state: 'busy', since: compacting.since, needsYou: false, asking: info.asking ?? null, compacting }
        syncAgent(top(pane))
    }
    const stateWatches = [[askingDir, (p, id) => setAsking(p, readAsking(id))], [compactingDir, (p, id) => setCompacting(p, readCompacting(id))]].map(([dir, apply]) => {
        try {
            require('fs').mkdirSync(dir, { recursive: true })
            return require('fs').watch(dir, (event, file) => {
                const id = file?.replace(/\.json$/, '')
                app.tabs.flatMap(t => t.getAllTabs?.() ?? [t]).filter(p => id && p.__tgInfo?.sessionId === id).forEach(p => apply(p, id))
            })
        } catch {
            return null
        }
    })

    function setBackground (pane, tasks) {
        const info = pane.__tgInfo
        const ids = tasks.map(t => String(t.pid))
        // While a task lives, look again every 3 s, so the badge goes soon after it ends; nothing polls otherwise.
        clearTimeout(pane.__tgBgTimer)
        if (ids.length && !isDisposed()) {
            pane.__tgBgTimer = setTimeout(() => inspect(pane), 3000)
        }
        if ((info.background?.ids?.join() ?? '') === ids.join()) {
            return
        }
        info.background = ids.length ? { count: ids.length, since: info.background?.since ?? Date.now(), ids, labels: tasks.map(taskLabel) } : null
        const shown = info.agent?.state === 'busy' ? null : info.background
        info.agent = info.agent
            ? { ...info.agent, background: shown }
            : shown && { state: 'waiting', since: Date.now(), needsYou: false, asking: info.asking ?? null, background: shown, compacting: info.compacting ?? null }
        syncAgent(top(pane))
    }

    const mergeBackground = list => list.length
        ? { count: list.reduce((n, b) => n + b.count, 0), since: Math.min(...list.map(b => b.since)), ids: list.flatMap(b => b.ids), labels: list.flatMap(b => b.labels) }
        : null
    /** The top tab's agent: busy if any pane works, needs you if any pane does. Emits tabby-groups:agent. */
    function syncAgent (t) {
        const panes = (t.getAllTabs?.() ?? [t]).map(p => p.__tgInfo?.agent).filter(Boolean)
        const busy = panes.filter(a => a.state === 'busy')
        const asking = panes.find(a => a.asking)?.asking ?? null
        const agent = panes.length ? {
            state: busy.length ? 'busy' : 'waiting',
            since: Math.max(...(busy.length ? busy : panes).map(a => a.since)),
            needsYou: !asking && panes.some(a => a.needsYou),
            asking,
            background: busy.length ? null : mergeBackground(panes.map(a => a.background).filter(Boolean)),
            compacting: panes.find(a => a.compacting)?.compacting ?? null,
        } : null
        // A split tab keeps the roll-up of its panes; a single pane already holds its own.
        if (!(t.getAllTabs?.() ?? [t]).includes(t)) {
            ;(t.__tgInfo ??= {}).agent = agent
        }
        window.dispatchEvent(new CustomEvent('tabby-groups:agent', { detail: { tab: t } }))
        queueRender()
    }
    /** Clears "needs you" on a tab: called when it is selected in a focused Tabby, and by tabby-remote when a device opens it. */
    function markSeen (tab) {
        const t = top(tab)
        t.__tgSeen = Date.now()
        const panes = (t.getAllTabs?.() ?? [t]).filter(p => p.__tgInfo?.agent?.needsYou)
        panes.forEach(p => { p.__tgInfo.agent = { ...p.__tgInfo.agent, needsYou: false } })
        if (panes.length) {
            syncAgent(t)
        }
    }

    const dispose = () => stateWatches.forEach(w => w?.close())
    return { updateAgent, readAsking, setAsking, readCompacting, setCompacting, setBackground, markSeen, dispose }
}

module.exports = { createAgent }
