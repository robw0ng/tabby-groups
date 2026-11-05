// node test-picker.js: checks the new-tab picker's rows and filter (picker.js), with no Tabby. Placement: picker.e2e.mjs.
const assert = require('assert')
const { pickerItems, filterItems } = require('./picker')

const pwsh = { id: 'local:pwsh', name: 'PowerShell' }
const profiles = [pwsh, { id: 'local:cmd', name: 'CMD' }, { id: 'ssh:t', name: 'SSH connection', isTemplate: true }]
const pinned = [
    { label: 'Claude in C:\\webapp', icon: '✳', command: 'claude', cwd: 'C:\\webapp' },
    { label: 'pwsh in core', profile: 'PowerShell', cwd: 'C:\\core' },
    { label: 'gone', profile: 'No such profile' },
    { label: 'no action' },
    null,
]
const cwds = ['C:\\a', null, 'C:\\b', 'C:\\a', 'C:\\c', 'C:\\d', 'C:\\e', 'C:\\f']

const rows = pickerItems({ profiles, pinned, files: true, cwds })
assert.deepStrictEqual(rows.map(r => `${r.section}: ${r.label}`), [
    'Profiles: PowerShell',
    'Profiles: CMD',
    'Pinned: Claude in C:\\webapp',
    'Pinned: pwsh in core',
    'Files: Files tab',
    // Bottom-most tab first, one per folder, five at most.
    'Recent folders: C:\\f',
    'Recent folders: C:\\e',
    'Recent folders: C:\\d',
    'Recent folders: C:\\c',
    'Recent folders: C:\\a',
])
assert.deepStrictEqual(rows[0].spec, { profile: pwsh })
assert.deepStrictEqual(rows[2].spec, { run: 'claude', cwd: 'C:\\webapp' })
assert.strictEqual(rows[2].icon, '✳')
assert.deepStrictEqual(rows[3].spec, { profile: pwsh, cwd: 'C:\\core' })
assert.deepStrictEqual(rows[4].spec, { files: true })
assert.deepStrictEqual(rows[5].spec, { cwd: 'C:\\f' })

// No tabby-files, no pins, no folders: profiles only.
assert.deepStrictEqual(pickerItems({ profiles }).map(r => r.label), ['PowerShell', 'CMD'])

// Filter: every word, any case, label or section.
assert.deepStrictEqual(filterItems(rows, 'claude WEB').map(r => r.label), ['Claude in C:\\webapp'])
assert.deepStrictEqual(filterItems(rows, 'recent c:\\e').map(r => r.label), ['C:\\e'])
assert.strictEqual(filterItems(rows, '  ').length, rows.length)
assert.deepStrictEqual(filterItems(rows, 'zzz'), [])

console.log('test-picker: all passed')
