// Types a message into another Tabby tab and presses Enter, so a CLI in that tab (Claude Code, Codex, a shell) acts on it.
//   node tab-say.mjs <tab title> <message> [--port 9222]
// The tab is the one whose title is <tab title>, else the one whose title contains it. It refuses: no match, more than
// one match, a tab not opened since Tabby started, and the caller's own tab. The tab is never focused or selected.
// Exit 0 when typed, 1 when refused (the reason on stderr), 2 when the DevTools port is closed.
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const [tab, message] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!tab || !message) {
  console.error('tab-say: usage: node tab-say.mjs <tab title> <message> [--port 9222]');
  process.exit(1);
}
const port = opt('port') ?? '9222';

let page;
try {
  page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
} catch { }
if (!page) {
  console.error(`tab-say: no DevTools port ${port} — start Tabby with --remote-debugging-port=${port}`);
  process.exit(2);
}
const expression = `window.__tabbyGroups?.say
  ? window.__tabbyGroups.say(${JSON.stringify(tab)}, ${JSON.stringify(message)}, { caller: ${process.pid} })
  : { ok: false, why: 'the tabby-groups Tabby plugin is not loaded, or too old for say()' }`;

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const reply = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});
ws.close();
const result = reply.result?.result?.value;
if (!result?.ok) {
  console.error('tab-say: ' + (result?.why ?? reply.result?.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'no answer'));
  process.exit(1);
}
console.log(`tab-say: typed into "${result.tab}"`);
