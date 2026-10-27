// Prints the last lines of another Tabby tab's screen as plain text, so a Claude can see what a shell there did.
//   node tab-read.mjs <tab title> [--lines 30] [--port 9222]
// The tab is named as in tab-say: its title, else a part of one, or "#<n>" when several match. Read-only.
// Pair with tab-say to drive a shell tab: say a command, then read its output.
// Exit 0 with the text, 1 when no tab matches (or it was not opened since Tabby started), 2 when the DevTools port is closed.
import { callerPage, tabbyPages, evaluateIn } from './tabby-window.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const [tab] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!tab) {
  console.error('tab-read: usage: node tab-read.mjs <tab title> [--lines 30] [--port 9222]');
  process.exit(1);
}
const port = opt('port') ?? '9222';
const lines = Number(opt('lines') ?? 30);

const { page } = await callerPage(port);
if (!page) {
  console.error(`tab-read: no DevTools port ${port} — start Tabby with --remote-debugging-port=${port}`);
  process.exit(2);
}
const others = (await tabbyPages(port) ?? []).filter((p) => p.id !== page.id);
const expression = `window.__tabbyGroups?.tabText?.(${JSON.stringify(tab)}, ${lines}) ?? null`;
for (const p of [page, ...others]) {
  const text = await evaluateIn(p, expression);
  if (typeof text === 'string') {
    console.log(text);
    process.exit(0);
  }
}
console.error(`tab-read: no single opened tab matches "${tab}"; pick one by number, e.g. "#2" (node tabby.mjs list)`);
process.exit(1);
