// node test-inbox.js: the inbox's choices (inbox.js) on fake panes, without Tabby.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-inbox-'))
const { createInbox, inboxDir, NUDGE } = require('./inbox')
const id = '11111111-2222-3333-4444-555555555555'
const wait = ms => new Promise(r => setTimeout(r, ms))

function pane (state, extra = {}) {
    const p = { sent: [], sendInput (d) { this.sent.push(d) }, __tgInfo: { kind: 'claude', sessionId: id, agent: { state, ...extra } } }
    return p
}

;(async () => {
    const inbox = createInbox({ app: {}, isDisposed: () => false })
    try {
        // Busy: queued only, nothing typed.
        const busy = pane('busy')
        inbox.watchInput(busy)
        assert.strictEqual(await inbox.deliver(busy, 'hi'), 'inbox')
        assert.deepStrictEqual(busy.sent, [])
        assert.match(fs.readFileSync(path.join(inboxDir, id + '.jsonl'), 'utf8'), /"text":"hi"/)

        // Idle and clear: the nudge, as text then Enter, not counted as the user's typing.
        const idle = pane('waiting')
        inbox.watchInput(idle)
        await inbox.onAgent(idle)
        await wait(200)
        assert.ok(idle.sent[0].startsWith(NUDGE) && idle.sent[1] === '\r' && idle.sent.length === 2)
        assert.ok(!idle.__tgDraft && !idle.__tgTyped)
        // A session without the hook keeps its file: no second nudge until a new message arrives.
        await inbox.onAgent(idle)
        assert.strictEqual(idle.sent.length, 2)

        // A menu question or a permission prompt: never typed into (a key would answer it).
        for (const asked of [{ kind: 'question' }, { kind: 'permission' }]) {
            const asking = pane('waiting', { asking: asked })
            inbox.watchInput(asking)
            await inbox.onAgent(asking)
            assert.deepStrictEqual(asking.sent, [])
        }
        // A question asked in plain text waits at a normal prompt: the nudge goes in.
        const texted = pane('waiting', { asking: { kind: 'question', source: 'text' } })
        inbox.watchInput(texted)
        await inbox.onAgent(texted)
        await wait(200)
        assert.ok(texted.sent[0]?.startsWith(NUDGE))

        // A draft holds the nudge; Enter sends the user's box, then Esc empties a new one and the nudge follows.
        const typing = pane('waiting')
        inbox.watchInput(typing)
        typing.sendInput('half a sent')
        assert.ok(typing.__tgDraft)
        await inbox.onAgent(typing)
        assert.deepStrictEqual(typing.sent, ['half a sent'])
        typing.sendInput('ence\r')
        assert.ok(!typing.__tgDraft)
        typing.sendInput('x')
        typing.sendInput('\x1b')
        assert.ok(!typing.__tgDraft)
        // Typed just now: it waits for 3 s of quiet.
        await inbox.onAgent(typing)
        assert.strictEqual(typing.sent.length, 4)
        typing.__tgTyped = Date.now() - 5000
        await inbox.onAgent(typing)
        await wait(200)
        assert.ok(typing.sent[4].startsWith(NUDGE) && typing.sent.length === 6)

        // Mouse, scroll and focus reports from a full-screen app are not typing: no draft, no quiet wait.
        const tui = pane('waiting')
        inbox.watchInput(tui)
        tui.sendInput('\x1b[<35;10;5M')
        tui.sendInput('\x1b[I')
        tui.sendInput('\x1b[<64;3;3M\x1b[O')
        assert.ok(!tui.__tgDraft && !tui.__tgTyped)
        tui.sendInput('\x1b[A')
        assert.ok(!tui.__tgDraft)

        // A pane wrapped by an older version is wrapped again; the old wrapper's draft logic no longer runs.
        const old = pane('waiting')
        const orig = old.sendInput
        old.__tgInputWatched = true
        old.sendInput = function (d) {
            if (!this.__tgSaying) this.__tgDraft = true
            return orig.call(this, d)
        }
        inbox.watchInput(old)
        old.sendInput('\x1b[I')
        assert.ok(!old.__tgDraft, 'the old wrapper set a draft')
        assert.deepStrictEqual(old.sent, ['\x1b[I'])

        // No session id: not queued, so say() types it as before.
        const unknown = pane('waiting')
        unknown.__tgInfo.sessionId = null
        assert.strictEqual(await inbox.deliver(unknown, 'x'), null)
        console.log('test-inbox: all passed')
    } finally {
        inbox.dispose()
        fs.rmSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true, force: true })
    }
})().catch(e => {
    console.error(e)
    process.exit(1)
})
