# Install tabby-groups

For an agent or a person. Every step is safe to run again. Each step has a Windows (PowerShell) and a macOS (zsh or bash) command.

**macOS is untested on a real Mac.** The steps follow Tabby's and Electron's macOS conventions; report what differs.

The repo has two parts:

| Part | Folder | Installed into |
| --- | --- | --- |
| Tabby plugin (the groups in the side bar) | repo root: `package.json` and the files its `"files"` list names | Tabby's plugin folder, as a copy |
| Claude Code plugin (the `tabby` skill and `scripts/tabby.mjs`) | `claude/` | Claude Code, from this repo as a local marketplace |

## Needs

Tabby 1.0, Node 22 or later, git, and Claude Code. The repo is private: `gh auth status` must show an account with access.

## 1. Get the repo

```powershell
# Windows
$repo = 'C:\tabby-groups'
if (Test-Path "$repo\.git") { git -C $repo pull --ff-only } else { git clone https://github.com/robw0ng/tabby-groups.git $repo }
```

```sh
# macOS
repo="$HOME/tabby-groups"
if [ -d "$repo/.git" ]; then git -C "$repo" pull --ff-only; else git clone https://github.com/robw0ng/tabby-groups.git "$repo"; fi
```

## 2. Install the Claude Code plugin

The same on both systems (`$repo` from step 1):

```sh
claude plugin marketplace add "$repo"        # "already" is fine
claude plugin marketplace update tabby-groups
claude plugin install tabby-groups@tabby-groups
claude plugin update tabby-groups@tabby-groups
```

## 3. Copy the Tabby plugin into Tabby

Tabby loads plugins from `<its user data folder>/plugins/node_modules`:

| System | Plugin folder |
| --- | --- |
| Windows | `%APPDATA%\tabby\plugins\node_modules\tabby-groups` |
| macOS | `~/Library/Application Support/tabby/plugins/node_modules/tabby-groups` |
| Linux | `~/.config/tabby/plugins/node_modules/tabby-groups` |

```powershell
# Windows
$dst = "$env:APPDATA\tabby\plugins\node_modules\tabby-groups"
New-Item -ItemType Directory -Force $dst | Out-Null
$files = @((Get-Content -Raw "$repo\package.json" | ConvertFrom-Json).files) + 'package.json'
Copy-Item ($files | ForEach-Object { Join-Path $repo $_ }) $dst -Force
```

```sh
# macOS
dst="$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-groups"
mkdir -p "$dst" && for f in $(node -p "require('$repo/package.json').files.join(' ')") package.json; do cp "$repo/$f" "$dst/"; done
```

Copy only `package.json` and the files in its `"files"` list. A link instead of a copy makes Tabby run the repo's working copy.

## 4. Open Tabby's DevTools port

`tabby.mjs` reaches Tabby through `--remote-debugging-port=9222`. The port is open only to this computer (127.0.0.1), and any program on it can use the port to control Tabby.

On Windows, this adds the flag to Tabby's shortcuts when it is missing:

```powershell
$shell = New-Object -ComObject WScript.Shell
$links = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:USERPROFILE\Desktop",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar" -Filter '*Tabby*.lnk' -Recurse -ErrorAction SilentlyContinue
foreach ($l in $links) {
  $s = $shell.CreateShortcut($l.FullName)
  if ($s.Arguments -notmatch 'remote-debugging-port') { $s.Arguments = ($s.Arguments + ' --remote-debugging-port=9222').Trim(); $s.Save() }
}
```

On macOS, a Dock or Finder start passes no flags. This makes a small app, "Tabby (port 9222)", that starts Tabby with the flag. Keep it in the Dock instead of Tabby:

```sh
mkdir -p "$HOME/Applications"
osacompile -o "$HOME/Applications/Tabby (port 9222).app" -e 'do shell script "open -a Tabby --args --remote-debugging-port=9222"'
```

The flag works only when Tabby starts. If Tabby already runs, quit it (Cmd+Q) first.

## 5. Restart Tabby, and set two settings

Tabby loads the plugin at start. Ask the user to quit Tabby and start it as in step 4. Do not quit it yourself: this session can run inside Tabby.

Then ask the user: "Apply the recommended Tabby settings?" On yes, run the setup script while Tabby runs. It saves through Tabby itself, changes only settings that still have Tabby's default, and prints each setting as before → after:

```powershell
# Windows
$path = (Get-Content "$env:USERPROFILE\.claude\plugins\installed_plugins.json" | ConvertFrom-Json).plugins.PSObject.Properties | Where-Object Name -like 'tabby-groups@*' | ForEach-Object { $_.Value[0].installPath } | Select-Object -First 1
node "$path\scripts\tabby-setup.mjs" --port 9222
```

```sh
# macOS
plugin=$(node -e "const p=require(process.env.HOME+'/.claude/plugins/installed_plugins.json').plugins;console.log(p[Object.keys(p).find(k=>k.startsWith('tabby-groups@'))][0].installPath)")
node "$plugin/scripts/tabby-setup.mjs" --port 9222
```

Add `--dry-run` to see the changes without saving them. Exit code 2 means the port is closed: the script prints the manual steps instead. On no, or by hand, the settings are:

| Setting (in Tabby's Settings) | Value | Why |
| --- | --- | --- |
| Window → Tabs → Tabs location | Left or Right | The groups show only in a side tab bar |
| Profiles & connections → Default profile | Windows: PowerShell Core (PowerShell 7), if installed; macOS: zsh | New tabs, and Claude Code tabs resumed after a restart, use this profile. Windows PowerShell 5.1 cannot read a PowerShell 7 profile. |
| Color scheme | deep, if it is still "Tabby Default" | The recommended dark scheme; a scheme the user chose stays |
| Appearance → Custom CSS | add `.activity-indicator { display: none !important; }` | Hides Tabby's activity dot; the plugin shows its own state marks |

Do not edit Tabby's `config.yaml` while Tabby runs: Tabby overwrites it.

## 6. Verify

```powershell
# Windows
$path = (Get-Content "$env:USERPROFILE\.claude\plugins\installed_plugins.json" | ConvertFrom-Json).plugins.'tabby-groups@tabby-groups'[0].installPath
node "$path\scripts\tabby.mjs" list
```

```sh
# macOS
plugin=$(node -e "console.log(require(process.env.HOME + '/.claude/plugins/installed_plugins.json').plugins['tabby-groups@tabby-groups'][0].installPath)")
node "$plugin/scripts/tabby.mjs" list
```

| Result | Meaning |
| --- | --- |
| JSON with `"plugin":true` | Done |
| JSON list without `"plugin":true` | Tabby runs without the plugin: check step 3, then restart Tabby |
| Exit code 2, "no DevTools port" | Tabby was not started with the flag: step 4 |

The Tabby side has its own check: `node "$repo/test-resume.js"` prints `all … passed`.

## What differs on macOS

| Feature | macOS |
| --- | --- |
| Session icons and folder line | From `ps` and `lsof`, instead of Windows' process API |
| Claude Code resume after a restart | Typed into the default profile's shell, with POSIX quoting |
| Launch scripts (`tabby.mjs open --file`) | A `.ps1` script needs PowerShell 7 (`pwsh`); any other script is sourced in the default shell |
| Window buttons | The traffic lights sit top left; with tabs on the left, the side bar starts below them |
