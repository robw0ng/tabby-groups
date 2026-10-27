const fs = require('fs')
const path = require('path')

/*
 * The inbox: a message for a Claude tab (tab-say, here or from a linked computer) is never typed over the user. It is
 * appended to <config>/tabby-groups/inbox/<session id>.jsonl, and the tabby-groups Claude plugin's inbox hook hands it
 * to Claude as context at its next step (a tool call, or a prompt). An idle Claude gets a short nudge typed in, but only
 * while it is not asking, nobody has typed in the last few seconds, and nothing is left unsent in its input box.
 */
const QUIET_MS = 3000
const WATCH_VERSION = 3
const NUDGE = '[tabby inbox] new messages'
const inboxDir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude'), 'tabby-groups', 'inbox')
const fileOf = id => path.join(inboxDir, id + '.jsonl')

function createInbox ({ app, isDisposed, queueRender = () => {} }) {
    const timers = new Map()

    /** Notes when anyone types into the pane (Tabby's keys and tabby-remote's both go through sendInput), and a draft. */
    function watchInput (pane) {
        if (pane.__tgInputWatched === WATCH_VERSION || typeof pane.sendInput !== 'function') {
            return
        }
        // An older wrapper took mouse and focus codes for a draft, or missed Tabby's Buffer keys: its flag is not to be trusted.
        if (pane.__tgInputWatched) {
            pane.__tgDraft = false
        }
        pane.__tgInputWatched = WATCH_VERSION
        // Wrapped once from the original: a reload replaces this wrapper instead of stacking another (an older one
        // under it is muted by __tgSaying while it runs).
        const send = pane.__tgSendOrig ??= pane.sendInput.bind(pane)
        pane.sendInput = data => {
            const saying = pane.__tgSaying
            // Tabby's own keyboard sends a Buffer, tabby-remote and pastes a string: both count.
            const text = typeof data === 'string' ? data : data instanceof Uint8Array ? Buffer.from(data).toString('utf8') : ''
            // Escape codes are the terminal talking (mouse, scroll, focus in a full-screen app), not typing.
            const keys = text ? text.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1bO./g, '') : ''
            if (!saying && keys) {
                pane.__tgTyped = Date.now()
                // Enter sends the box; Ctrl+C or Esc empties it. Anything else may leave text in it.
                const last = Math.max(keys.lastIndexOf('\r'), keys.lastIndexOf('\x03'), keys === '\x1b' ? 0 : -1)
                pane.__tgDraft = last >= 0 ? keys.slice(last + 1).length > 0 : true
                flushLater(pane)
            }
            pane.__tgSaying = true
            try {
                return send(data)
            } finally {
                pane.__tgSaying = saying
            }
        }
    }

    const typeIn = async (pane, text) => {
        pane.__tgSaying = true
        try {
            // Text and Enter in one write reads as a paste to Claude Code, which then takes the Enter as a new line.
            pane.sendInput(String(text).replace(/\r?\n/g, ' '))
            await new Promise(r => setTimeout(r, 150))
            pane.sendInput('\r')
        } finally {
            pane.__tgSaying = false
        }
    }

    // The inbox's last change, or null when empty: a session without the hook keeps its file, and is nudged once per change.
    const pending = id => {
        try {
            const st = fs.statSync(fileOf(id))
            return st.size > 0 ? `${st.mtimeMs} ${st.size}` : null
        } catch {
            return null
        }
    }

    /** Types the nudge when the pane is idle and clear; otherwise looks again once typing pauses or the state changes. */
    async function flush (pane) {
        watchInput(pane) // a pane open before a reload still runs the old wrapper until here
        const id = pane.__tgInfo?.sessionId
        const change = id && pending(id)
        if (isDisposed() || !change || pane.__tgNudged === change) {
            return
        }
        const agent = pane.__tgInfo.agent
        const quietFor = Date.now() - (pane.__tgTyped ?? 0)
        // A menu or a permission prompt takes keys as answers; a question asked in plain text waits at a normal prompt.
        const answering = agent?.asking && agent.asking.source !== 'text'
        if (agent?.state !== 'waiting' || answering || pane.__tgDraft) {
            return
        }
        if (quietFor < QUIET_MS) {
            return flushLater(pane, QUIET_MS - quietFor)
        }
        pane.__tgNudged = change
        await typeIn(pane, `${NUDGE} (in your context; if not, read ${fileOf(id)})`)
    }
    function flushLater (pane, ms = QUIET_MS) {
        clearTimeout(timers.get(pane))
        timers.set(pane, setTimeout(() => {
            timers.delete(pane)
            flush(pane)
        }, ms))
    }

    /** Puts `text` in the inbox of the Claude in `pane` and delivers or nudges as it can: 'inbox', or null without a session id. */
    async function deliver (pane, text) {
        const id = pane.__tgInfo?.sessionId
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
            return null
        }
        fs.mkdirSync(inboxDir, { recursive: true })
        fs.appendFileSync(fileOf(id), JSON.stringify({ text: String(text), at: Date.now() }) + '\n')
        queueRender() // the tab's mail badge
        await flush(pane)
        return 'inbox'
    }

    /** A tab's Claude changed state (agent.js): an idle one may take its nudge now. */
    const onAgent = t => (t.getAllTabs?.() ?? [t]).forEach(p => flush(p))

    const dispose = () => timers.forEach(clearTimeout)
    /** Whether the Claude in `pane` has messages its hook has not taken yet: the tab shows a mail badge. */
    const unread = pane => !!(pane.__tgInfo?.sessionId && pending(pane.__tgInfo.sessionId))

    return { watchInput, deliver, typeIn, onAgent, unread, dispose }
}

module.exports = { createInbox, inboxDir, NUDGE }
