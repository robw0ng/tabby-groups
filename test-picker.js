// node test-picker.js: checks the new-tab picker's rows and filter (picker.js) and the settings page's pin switch
// (settings.js), with no Tabby. Placement: picker.e2e.mjs.
const assert = require('assert')
const { pickerItems, filterItems } = require('./picker')
const { setPin } = require('./settings')

const pwsh = { id: 'local:pwsh', name: 'PowerShell' }
const cmd = { id: 'local:cmd', name: 'CMD' }
const wsl = { id: 'local:wsl', name: 'WSL' }
const profiles = [pwsh, cmd, wsl, { id: 'ssh:t', name: 'SSH connection', isTemplate: true }]
const pinned = [
    { profile: 'WSL' },
    { profile: 'local:cmd', label: 'Command Prompt' },
    { label: 'Claude in C:\\webapp', icon: '✳', command: 'claude', cwd: 'C:\\webapp' },
    { label: 'pwsh in core', profile: 'PowerShell', cwd: 'C:\\core' },
    // The default profile pinned with no folder is already on top; an unknown profile, a template, no action: left out.
    { profile: 'PowerShell' },
    { label: 'gone', profile: 'No such profile' },
    { profile: 'SSH connection' },
    { label: 'no action' },
    null,
]

const rows = pickerItems({ defaultProfile: pwsh, profiles, pinned, files: true })
assert.deepStrictEqual(rows.map(r => `${r.block} ${r.label}`), [
    '0 PowerShell',
    '1 WSL',
    '1 Command Prompt',
    '1 Claude in C:\\webapp',
    '1 pwsh in core',
    '2 Files tab',
    '2 New empty group',
])
assert.deepStrictEqual(rows[0].spec, { profile: pwsh })
assert.deepStrictEqual(rows[1].spec, { profile: wsl, cwd: undefined })
assert.deepStrictEqual(rows[2].spec, { profile: cmd, cwd: undefined })
assert.deepStrictEqual(rows[3].spec, { run: 'claude', cwd: 'C:\\webapp' })
assert.strictEqual(rows[3].icon, '✳')
assert.deepStrictEqual(rows[4].spec, { profile: pwsh, cwd: 'C:\\core' })
assert.deepStrictEqual(rows[5].spec, { files: true })
assert.deepStrictEqual(rows[6].spec, { newGroup: true })

// No other profile shows unless pinned; no tabby-files, no Files row; inside a group, a subgroup.
assert.deepStrictEqual(pickerItems({ defaultProfile: pwsh, profiles }).map(r => r.label), ['PowerShell', 'New empty group'])
assert.strictEqual(pickerItems({ defaultProfile: pwsh, profiles, group: 'api' }).at(-1).label, 'New empty subgroup')

// Filter: every word, any case, in the label.
assert.deepStrictEqual(filterItems(rows, 'claude WEB').map(r => r.label), ['Claude in C:\\webapp'])
assert.strictEqual(filterItems(rows, '  ').length, rows.length)
assert.deepStrictEqual(filterItems(rows, 'zzz'), [])

// The settings switch: on adds a pin by id; off removes the profile's bare pins (by name or id) and keeps a richer entry.
const rich = { profile: 'WSL', cwd: 'C:\\core' }
const settings = { autoResume: true, picker: [{ command: 'claude', label: 'c' }, { profile: 'local:wsl' }, { profile: 'WSL' }, rich] }
assert.deepStrictEqual(setPin(settings, cmd, true).picker, [...settings.picker, { profile: 'local:cmd' }])
assert.deepStrictEqual(setPin(settings, wsl, false), { autoResume: true, picker: [{ command: 'claude', label: 'c' }, rich] })
assert.deepStrictEqual(setPin({ picker: { bad: 1 } }, wsl, true), { picker: [{ profile: 'local:wsl' }] })

// A pin of a missing profile is left out even with a command; a label that is not a string still filters.
assert.deepStrictEqual(pickerItems({ profiles, pinned: [{ profile: 'gone', command: 'claude' }] }).map(r => r.label), ['New empty group'])
assert.strictEqual(filterItems([{ label: 5 }], '5').length, 1)

console.log('test-picker: all passed')
