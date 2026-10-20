// Types a message into another Tabby tab and presses Enter, so a CLI in that tab (Claude Code, Codex, a shell) acts on it.
//   node tab-say.mjs <tab title> <message> [--port 9222]
// The tab is the one whose title is <tab title>, else the one whose title contains it. It refuses: no match, more than
// one match, a tab not opened since Tabby started, and the caller's own tab. The tab is never focused or selected.
// With several Tabby windows it looks in the caller's window first, then in the others.
// Exit 0 when typed, 1 when refused (the reason on stderr), 2 when the DevTools port is closed.
import { callerPage, tabbyPages, evaluateIn } from './tabby-window.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const [tab, message] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!tab || !message) {
  console.error('tab-say: usage: node tab-say.mjs <tab title> <message> [--port 9222]');
  process.exit(1);
}
const port = opt('port') ?? '9222';

const { page } = await callerPage(port);
if (!page) {
  console.error(`tab-say: no DevTools port ${port} — start Tabby with --remote-debugging-port=${port}`);
  process.exit(2);
}
const others = (await tabbyPages(port) ?? []).filter((p) => p.id !== page.id);
const expression = `window.__tabbyGroups?.say
  ? window.__tabbyGroups.say(${JSON.stringify(tab)}, ${JSON.stringify(message)}, { caller: ${process.pid} })
  : { ok: false, why: 'the tabby-groups Tabby plugin is not loaded, or too old for say()' }`;

let result;
for (const p of [page, ...others]) {
  result = await evaluateIn(p, expression);
  // Only "no tab here" moves on to the next window; any other refusal is final.
  if (result?.ok || !/^no tab matches/.test(result?.why ?? '')) break;
}
if (!result?.ok) {
  console.error('tab-say: ' + (result?.why ?? 'no answer from Tabby'));
  process.exit(1);
}
console.log(`tab-say: typed into "${result.tab}"`);
