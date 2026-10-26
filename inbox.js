const fs = require('fs')
const path = require('path')

/*
 * The inbox: a message for a Claude tab (tab-say, here or from a linked computer) is never typed over the user. It is
 * appended to <config>/tabby-groups/inbox/<session id>.jsonl, and the tabby-groups Claude plugin's inbox hook hands it
 * to Claude as context at its next step (a tool call, or a prompt). An idle Claude gets a short nudge typed in, but only
 * while it is not asking, nobody has typed in the last few seconds, and nothing is left unsent in its input box.
 */
const QUIET_MS = 3000
const NUDGE = '[tabby inbox] new messages'
const inboxDir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude'), 'tabby-groups', 'inbox')
const fileOf = id => path.join(inboxDir, id + '.jsonl')

function createInbox ({ app, isDisposed }) {
    const timers = new Map()

    /** Notes when anyone types into the pane (Tabby's keys and tabby-remote's both go through sendInput), and a draft. */
    function watchInput (pane) {
        if (pane.__tgInputWatched || typeof pane.sendInput !== 'function') {
            return
        }
        pane.__tgInputWatched = true
        const send = pane.sendInput.bind(pane)
        pane.sendInput = data => {
            if (!pane.__tgSaying) {
                const s = typeof data === 'string' ? data : ''
                pane.__tgTyped = Date.now()
                // Enter sends the box; Ctrl+C or Esc empties it. Anything else may leave text in it.
                const last = Math.max(s.lastIndexOf('\r'), s.lastIndexOf('\x03'), s === '\x1b' ? 0 : -1)
                pane.__tgDraft = last >= 0 ? s.slice(last + 1).length > 0 : pane.__tgDraft || s.length > 0
                flushLater(pane)
            }
            return send(data)
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
        const id = pane.__tgInfo?.sessionId
        const change = id && pending(id)
        if (isDisposed() || !change || pane.__tgNudged === change) {
            return
        }
        const agent = pane.__tgInfo.agent
        const quietFor = Date.now() - (pane.__tgTyped ?? 0)
        if (agent?.state !== 'waiting' || agent.asking || pane.__tgDraft) {
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
        await flush(pane)
        return 'inbox'
    }

    /** A tab's Claude changed state (agent.js): an idle one may take its nudge now. */
    const onAgent = t => (t.getAllTabs?.() ?? [t]).forEach(p => flush(p))

    const dispose = () => timers.forEach(clearTimeout)
    return { watchInput, deliver, typeIn, onAgent, dispose }
}

module.exports = { createInbox, inboxDir, NUDGE }
