# Install tabby-groups

For an agent or a person. Every step is safe to run again. The commands are PowerShell, for Windows. On macOS or Linux, use the paths in the table in step 3.

The repo has two parts:

| Part | Folder | Installed into |
| --- | --- | --- |
| Tabby plugin (the groups in the side bar) | repo root: `index.js`, `icons.js`, `package.json` | Tabby's plugin folder, as a copy |
| Claude Code plugin (the `tabby` skill and `scripts/tabby.mjs`) | `claude/` | Claude Code, from this repo as a local marketplace |

## Needs

Tabby 1.0, Node 22 or later, git, and Claude Code. The repo is private: `gh auth status` must show an account with access.

## 1. Get the repo

```powershell
$repo = 'C:\tabby-groups'
if (Test-Path "$repo\.git") { git -C $repo pull --ff-only } else { git clone https://github.com/robw0ng/tabby-groups.git $repo }
```

## 2. Install the Claude Code plugin

```powershell
claude plugin marketplace add $repo        # "already" is fine
claude plugin marketplace update tabby-groups
claude plugin install tabby-groups@tabby-groups
claude plugin update tabby-groups@tabby-groups
```

## 3. Copy the Tabby plugin into Tabby

| System | Plugin folder |
| --- | --- |
| Windows | `%APPDATA%\tabby\plugins\node_modules\tabby-groups` |
| macOS | `~/Library/Application Support/tabby/plugins/node_modules/tabby-groups` |
| Linux | `~/.config/tabby/plugins/node_modules/tabby-groups` |

```powershell
$dst = "$env:APPDATA\tabby\plugins\node_modules\tabby-groups"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$repo\index.js", "$repo\icons.js", "$repo\package.json" $dst -Force
```

Copy only these three files. A link or a junction instead of a copy makes Tabby run the repo's working copy.

## 4. Open Tabby's DevTools port

`tabby.mjs` reaches Tabby through `--remote-debugging-port=9222`. This adds the flag to Tabby's shortcuts when it is missing:

```powershell
$shell = New-Object -ComObject WScript.Shell
$links = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:USERPROFILE\Desktop",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar" -Filter '*Tabby*.lnk' -Recurse -ErrorAction SilentlyContinue
foreach ($l in $links) {
  $s = $shell.CreateShortcut($l.FullName)
  if ($s.Arguments -notmatch 'remote-debugging-port') { $s.Arguments = ($s.Arguments + ' --remote-debugging-port=9222').Trim(); $s.Save() }
}
```

The port is open only to this PC (127.0.0.1), and any program on this PC can use it to control Tabby.

## 5. Restart Tabby, and set two settings

Tabby loads the plugin at start. Ask the user to close Tabby and start it from a shortcut. Do not close it yourself: this session can run inside Tabby.

Then ask the user to set, in Tabby's **Settings**:

| Setting | Value | Why |
| --- | --- | --- |
| Appearance > Tabs location | Left or Right | The groups show only in a side tab bar |
| Terminal > Default profile | PowerShell Core (if PowerShell 7 is installed) | New tabs and resumed Claude Code tabs use this profile. Windows PowerShell 5.1 cannot read a PowerShell 7 profile. |

Do not edit Tabby's `config.yaml` while Tabby runs: Tabby overwrites it.

## 6. Verify

```powershell
$path = (Get-Content "$env:USERPROFILE\.claude\plugins\installed_plugins.json" | ConvertFrom-Json).plugins.'tabby-groups@tabby-groups'[0].installPath
node "$path\scripts\tabby.mjs" list
```

| Result | Meaning |
| --- | --- |
| JSON with `"plugin":true` | Done |
| JSON list without `"plugin":true` | Tabby runs without the plugin: check step 3, then restart Tabby |
| Exit code 2, "no DevTools port" | Tabby was not started from a shortcut with the flag: step 4, then restart Tabby |

The Tabby side has its own check: `node "$repo\test-resume.js"` prints `all 12 passed`.
