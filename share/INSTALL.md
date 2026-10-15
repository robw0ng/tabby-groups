# Install the tabby-groups Tabby plugin

For an agent. Every step is safe to run again.

Rules:
- No admin rights. Change nothing outside Tabby's plugins folder: no settings, no shortcuts, no start flags, no network.
- Never close or kill Tabby yourself: the user can lose open work. Ask the user to quit and reopen it.
- Stop and tell the user when a step fails.

## 1. Find Tabby's plugins folder

| System | Plugins folder |
| --- | --- |
| Windows | `%APPDATA%\tabby\plugins\node_modules` |
| macOS | `~/Library/Application Support/tabby/plugins/node_modules` |

```powershell
# Windows
$data = "$env:APPDATA\tabby"
if (-not (Test-Path $data)) { 'Tabby is not installed, or it has never started'; return }
$plugins = "$data\plugins\node_modules"
```

```sh
# macOS
data="$HOME/Library/Application Support/tabby"
[ -d "$data" ] || { echo "Tabby is not installed, or it has never started"; exit 1; }
plugins="$data/plugins/node_modules"
```

If Tabby's data folder is missing, stop: ask the user to install Tabby and start it once.

## 2. Check for an earlier install

```powershell
# Windows
if (Test-Path "$plugins\tabby-groups\package.json") { (Get-Content "$plugins\tabby-groups\package.json" | ConvertFrom-Json).version }
```

```sh
# macOS
grep '"version"' "$plugins/tabby-groups/package.json" 2>/dev/null
```

If a version prints, tell the user the installed version and this zip's version (in `tabby-groups/package.json`), and ask before you replace it.

## 3. Copy the plugin

Copy the `tabby-groups` folder from this zip into the plugins folder. Nothing needs to be installed or built.

```powershell
# Windows, from the unzipped folder
New-Item -ItemType Directory -Force $plugins | Out-Null
Copy-Item -Recurse -Force .\tabby-groups $plugins
```

```sh
# macOS, from the unzipped folder
mkdir -p "$plugins" && cp -R ./tabby-groups "$plugins/"
```

## 4. Restart Tabby

Ask the user to quit Tabby and start it again. Tabby loads plugins only at start.

## 5. Verify

Check that `index.js`, `icons.js` and `package.json` are in `<plugins folder>/tabby-groups`. Then ask the user to set **Settings > Appearance > Tabs location** to Left or Right, if it is not already, and to confirm that the side tab bar shows a search box at the top.

## 6. Report

Tell the user:
- the version that is installed now;
- to drop a tab on another tab to make a group, and to right-click a group header for its options;
- how to uninstall: quit Tabby, delete `<plugins folder>/tabby-groups`, and start Tabby again.

macOS support is untested on a real Mac. If something differs there, tell the user what you saw.
