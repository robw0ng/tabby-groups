# tabby-groups

Real tab groups for [Tabby](https://tabby.sh)'s side tab bar: nested, coloured, collapsible groups, with session icons, a folder line and search for every tab.

It runs on Windows. macOS support is built in but untested on a real Mac.

It works when Tabby's tabs are on the left or the right. With tabs on the top or the bottom, Tabby looks as usual and the groups wait until the tabs are back on the side.

## What you get

| Feature | Detail |
| --- | --- |
| Groups | Name, colour, collapse, pin. Groups go inside groups, with no depth limit, drawn as nested panels. |
| Collapse | A collapsed group still shows the tab you are in, until you select another tab |
| Drag and drop | Drop a tab on another tab to make a group, as on an iPhone. Drop on an edge to reorder. Drag a group header to move the whole group. |
| Rename | Double-click a group name or a tab title to rename it in place |
| New tab | Double-click empty space, or click a group's +, to open a tab in that group |
| Session icons | Claude Code, Codex, Gemini, Node, Python, Docker, Vim, SSH, PowerShell, cmd, Bash, WSL and more |
| Your own icons | `tabby-groups.json` in Tabby's settings folder: `{ "icons": [{ "name", "title"?, "process"?, "color"?, "emoji" \| "path" \| "paths", "stroke"? }] }`. `title` and `process` are patterns for the tab title and a command line under the tab. Edits apply at once. |
| Your own buttons | `"buttons": [{ "label", "command", "cwd"?, "icon"? (Font Awesome name) \| "emoji" \| "path" \| "paths", "check"?, "checkEveryMinutes"? }]` in the same file. A button sits before Tabby's own toolbar buttons; a click types `command` into a new tab that stays open. With `check`, the button is an update: it shows (green, with a dot) only while the check exits 10 (run at start and every `checkEveryMinutes`, default 30); its tooltip says "Update available" and lists the check's output, and ✕ hides it until that output changes. With `"alwaysShow": true` it stays in the bar when there is nothing new too (plain, tooltip "nothing new"), so a click can force the update any time. A click runs `command` in the background (the icon spins), saves the output to a log, and shows a toast: "up to date ✓", the `problems`, or the `reload` plugins from a JSON object on the command's last line, with "Open log". On macOS, commands and checks run in the user's login shell. |
| Resume without a click | Settings → Tab groups → "Resume Claude tabs after a restart" (off by default; stored as `"autoResume": true` in `tabby-groups.json`): after a restart, restored Claude tabs resume by themselves, two at a time, each pair once the previous one is idle (90 s at most); the front tab, the keyboard focus and the tab order stay as they are. Off: a Claude tab resumes when it is first opened. |
| Reload in place | A plugin `tabby-x` that puts `window.__tabbyX.reload()` on the page reloads without a Tabby restart (tabby-groups and tabby-remote do). After an update button's run, the plugins in its `reload` list reload by themselves in every Tabby window, and a notice says which ones did and which need a restart. With `"autoReload": false` in `tabby-groups.json`, the update toast only offers "Reload plugins" instead; `node claude/scripts/tabby-reload.mjs [--port 9222] tabby-groups tabby-remote` does the same from a script (exit 0 all reloaded, 3 some need a restart, 2 port closed). A change to a plugin's Angular providers still needs a restart. |
| Folder line | Each tab shows its current folder under its title |
| Claude Code state | A ring while Claude works; a dot when it finished while you were away; an amber "?" while it asks you a question and "!" while it asks for a permission (needs the Claude Code plugin's hooks). Group headers count all of them. |
| Search | Matches titles, group names, folders, apps and tab numbers (`#12`). Enter opens the first match. |
| Pins | A pinned group goes first in its scope; a tab pinned in a group goes first in that group |
| Resize | Drag the side bar's inner edge |
| Restart | Groups, colours, pins and folders come back. Claude Code and Codex sessions resume in their folder. |

## Install

Follow [INSTALL.md](INSTALL.md). It installs both parts, and every step is safe to run again:

| Part | Does |
| --- | --- |
| Tabby plugin (repo root) | The groups in Tabby's side bar. Needs Tabby 1.0, no dependencies. |
| Claude Code plugin (`claude/`) | A `tabby` skill and `scripts/tabby.mjs`, so Claude Code can open, list and move tabs in groups ("put these tabs in a group") |

## Use

| To | Do |
| --- | --- |
| Make a group | Drop a tab on another tab, or right-click a tab > Add to group > New group |
| Change a group | Right-click its header: colour, rename, collapse, pin, move into another group, ungroup |
| Collapse or expand | Click the group header |
| Leave a group | Right-click the tab > Remove from group |
| Move a tab to another window | Right-click the tab > Move to window > Window n or New window. The shell and any Claude in it keep running; a split tab moves whole; its group comes along. If its shell ended in between, a new shell resumes the Claude or Codex session. Window 1 is the oldest window. Or drag the tab out of its window: dropped over another Tabby window, it goes to the row under the pointer (on the free space below the rows, to the end outside every group; on the terminal, it keeps its group); dropped outside every window, it opens in a new one. Escape before the drop cancels. The drop sees only Tabby windows: over another app that covers a Tabby window, the tab still goes to that Tabby window. |
| Cancel a drag | Press Escape |

## Works with tabby-remote

[tabby-remote](https://github.com/robw0ng/tabby-remote) shows the same groups on your phone. Changes on either side show on both, and Tabby shows which devices have each tab open.

## Scripting

Other tools can drive the groups through `window.__tabbyGroups` in Tabby's window. The Claude Code plugin's `scripts/tabby-eval.mjs` runs a JavaScript file inside Tabby through its DevTools port and prints the result as JSON, with no shell quoting (`node scripts/tabby-eval.test.mjs --port <test Tabby port>` checks it). The functions:

| Function | Does |
| --- | --- |
| `open({ title, command, args, cwd, run, group, parent, color })` | Opens a shell tab in a group and types `run` once the shell is ready |
| `addTab(tab, group, { color, parent })` / `removeTab(tab)` | Puts a tab in a group, or takes it out |
| `setCollapsed`, `setColor`, `setPinned`, `setParent`, `rename`, `ungroup` | Change a group |
| `setTabPinned(tab, pinned)` | Pins a tab inside its group |
| `drop(source, target, where)` | A drag and drop without a mouse, with the same rules |
| `list()` | All groups, with their tabs and Claude Code counts |
| `markSeen(tab)` | Clears a tab's "finished while you were away" dot |
| `tabText(name, lines = 30)` | The last `lines` non-empty screen lines of the tab titled `name` (else the first title that contains it), as plain text. Read-only. Null when no tab matches, or for a restored tab that was not opened yet. |
| `say(name, text, { caller })` | Types `text` into the one tab titled `name` (else the one whose title contains it) and presses Enter, without focusing it. Refuses no match, more than one match, a tab not opened yet, and the tab with the `caller` pid under its shell. Returns `{ ok, why }`. |
| `move(name, window)` / `windows()` | Moves the tab titled `name` (else the one whose title contains it), or a tab object, to window `window` (a number from `windows()`, oldest first) or `'new'`. Returns `{ ok, window }` or `{ ok: false, why }`; on a failure the tab stays. `windows()` lists `{ n, me }`. |

### Wake another session: tab-say

`node claude/scripts/tab-say.mjs <tab title> <message> [--port 9222]` types a message into another tab, so a Claude Code or Codex session there reads a file another session wrote. Exit 0 typed, 1 refused (the reason on stderr), 2 port closed. A busy Claude Code queues the message and runs it after its turn. Newlines in the message become spaces. To let Codex wake a Claude tab, add this line to its instructions (AGENTS.md), with the real path:

```
After you write a file for another session, wake it: node <tabby-groups>/claude/scripts/tab-say.mjs "<its tab title>" "read <file>"
```

## Test

```sh
node test-resume.js
```

Checks the command that resumes a Claude Code session after a restart, and its quoting for PowerShell and POSIX shells.

```sh
node test-inbox.js
node claude/scripts/inbox.test.mjs
```

Check the inbox: a message for a Claude tab is queued, never typed over a draft or a question, and an idle Claude gets one nudge per new message; the hook hands each message over once.
