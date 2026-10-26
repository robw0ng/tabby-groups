// Types a message into another Tabby tab and presses Enter, so a CLI in that tab (Claude Code, Codex, a shell) acts on it.
//   node tab-say.mjs <tab title> <message> [--port 9222]
// The tab is the one whose title is <tab title>, else the one whose title contains it. It refuses: no match, more than
// one match, a tab not opened since Tabby started, and the caller's own tab. The tab is never focused or selected.
// With several Tabby windows it looks in the caller's window first, then in the others.
//   node tab-say.mjs <tab title> <message> --computer <name>   a Claude tab on a computer linked through tabby-remote
//   node tab-say.mjs --computer <name>                          lists the Claude tabs there
// There only Claude tabs are typed into, and the message arrives as "[from <this computer> · "<this tab>"] <message>"
// with the reply command, so the chat there can answer.
// Exit 0 when typed, 1 when refused (the reason on stderr), 2 when the DevTools port is closed.
import { callerPage, tabbyPages, evaluateIn } from './tabby-window.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const [tab, message] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const computer = opt('computer');
if (!computer && (!tab || !message) || computer && tab && !message) {
  console.error('tab-say: usage: node tab-say.mjs <tab title> <message> [--computer <name>] [--port 9222] | --computer <name>');
  process.exit(1);
}
const port = opt('port') ?? '9222';

const { page } = await callerPage(port);
if (!page) {
  console.error(`tab-say: no DevTools port ${port} — start Tabby with --remote-debugging-port=${port}`);
  process.exit(2);
}

if (computer) {
  const talk = `window.__tabbyRemote?.talk`;
  const call = tab
    ? `${talk}.say(${JSON.stringify(computer)}, ${JSON.stringify(tab)}, ${JSON.stringify(message)}, await window.__tabbyGroups?.tabOf?.(${process.pid}))`
    : `${talk}.chats(${JSON.stringify(computer)})`;
  const r = await evaluateIn(page, `(async () => ${talk}
    ? ${call}
    : { ok: false, why: 'the tabby-remote Tabby plugin is not loaded, or too old to talk to other computers' })()`);
  if (!r?.ok) {
    console.error('tab-say: ' + (r?.why ?? 'no answer from Tabby'));
    process.exit(1);
  }
  console.log(tab ? `tab-say: ${r.via === 'inbox' ? 'in the inbox of' : 'typed into'} "${r.tab}" on ${computer}` : JSON.stringify({ computer, chats: r.chats }));
  process.exit(0);
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
console.log(`tab-say: ${result.via === 'inbox' ? 'in the inbox of' : 'typed into'} "${result.tab}"`);
