// node test-scope.js: checks group ids, sibling-unique names, name and path lookup, and the migration of groups saved
// by name (scope.js), with no Tabby. TG_REAL_STATE=<file> also migrates a copy of real saved state (see the end).
const assert = require('assert')
const fs = require('fs')
const { uniqueName, pathOf, resolve, loadSaved, restorePath, childNamed } = require('./scope')

const mk = (...gs) => new Map(gs.map(g => [g.id, { parent: null, color: null, ...g }]))

// Names: unique among siblings only; the lowest free " (n)".
let groups = mk({ id: 't', name: 'tooling' }, { id: 'w', name: 'web' }, { id: 'o1', name: 'owners', parent: 't' }, { id: 'o2', name: 'owners (2)', parent: 't' })
assert.strictEqual(uniqueName(groups, 'w', 'owners'), 'owners', 'another parent: no suffix')
assert.strictEqual(uniqueName(groups, 't', 'owners'), 'owners (1)', 'the lowest free number')
assert.strictEqual(uniqueName(groups, 't', 'owners', groups.get('o1')), 'owners', 'its own name is not a clash')
assert.strictEqual(uniqueName(groups, null, 'tooling'), 'tooling (1)')

// Lookup: an id, a name only one group has, a path, { name, parent }; a shared name throws.
groups.set('o3', { id: 'o3', name: 'owners', parent: 'w' })
assert.strictEqual(resolve(groups, 'o3'), 'o3')
assert.strictEqual(resolve(groups, 'web'), 'w')
assert.strictEqual(resolve(groups, 'web/owners'), 'o3')
assert.strictEqual(resolve(groups, 'tooling/owners'), 'o1')
assert.strictEqual(resolve(groups, { name: 'owners', parent: 'tooling' }), 'o1')
assert.strictEqual(resolve(groups, { name: 'tooling', parent: null }), 't')
assert.strictEqual(resolve(groups, { name: 'owners', parent: 'nope' }), null)
assert.strictEqual(resolve(groups, 'nope/owners'), null)
assert.strictEqual(resolve(groups, 'nope'), null)
assert.throws(() => resolve(groups, 'owners'), /names 2 groups; give its path/)
assert.strictEqual(pathOf(groups, 'o3'), 'web/owners')
groups.set('s', { id: 's', name: 'a/b', parent: null })
assert.strictEqual(resolve(groups, 'a/b'), 's', 'a name with a slash still finds its group')

// Migration: groups saved by name get ids, and their parents follow by name; an unknown parent makes a top-level group.
groups = new Map()
const old = loadSaved(groups, [{ name: 'outer', color: '#f00', collapsed: true, parent: null, pinned: true, slot: 2 }, { name: 'inner', color: null, parent: 'outer' }, { name: 'lost', parent: 'gone' }])
assert.strictEqual(groups.size, 3)
const outer = groups.get(old.get('outer'))
assert.deepStrictEqual([outer.name, outer.color, outer.collapsed, outer.pinned, outer.slot, outer.parent], ['outer', '#f00', true, true, 2, null], 'colour, fold, pin and place kept')
assert.strictEqual(groups.get(old.get('inner')).parent, outer.id)
assert.strictEqual(groups.get(old.get('lost')).parent, null)
// Saved with ids: kept as they are.
const again = new Map()
assert.strictEqual(loadSaved(again, [...groups.values()]).size, 0)
assert.deepStrictEqual([...again.values()], [...groups.values()])

// A restored tab: an old path (names) joins the migrated groups; a new path (ids) finds them by id, else makes them with that id.
let chain = restorePath(groups, [{ name: 'outer', color: '#0f0', collapsed: false }, { name: 'inner', color: null }])
assert.deepStrictEqual(chain.map(g => g.id), [old.get('outer'), old.get('inner')], 'old names find the migrated groups')
assert.strictEqual(outer.color, '#0f0', 'the saved colour wins, as before ids')
chain = restorePath(groups, [{ id: 'x1', name: 'outer' }, { id: 'x2', name: 'deep' }])
assert.strictEqual(chain[0].id, old.get('outer'), 'an unknown id with a known name in its place: the same group')
assert.strictEqual(chain[1].id, 'x2', 'a group made from a path keeps its saved id')
assert.strictEqual(chain[1].parent, old.get('outer'))
chain = restorePath(groups, [{ id: 'x2', name: 'deep' }])
assert.strictEqual(chain[0].id, 'x2', 'found by id wherever it is')
// Same name under two parents: two groups.
groups = new Map()
const a = restorePath(groups, [{ name: 'tooling' }, { name: 'owners' }]).at(-1)
const b = restorePath(groups, [{ name: 'web' }, { name: 'owners' }]).at(-1)
assert.notStrictEqual(a.id, b.id)
assert.strictEqual(childNamed(groups, a.parent, 'owners'), a)

// TG_REAL_STATE: a read-only copy of a Tabby's saved groups, as { emptyGroups, paths: [token.tabbyGroup | null],
// live: list() before the migration }. Every group, parent link, colour, pin and member must come through.
if (process.env.TG_REAL_STATE) {
    const real = JSON.parse(fs.readFileSync(process.env.TG_REAL_STATE, 'utf8'))
    const gs = new Map()
    loadSaved(gs, real.emptyGroups)
    const members = real.paths.map(path => {
        if (!path) {
            return null
        }
        const c = restorePath(gs, path)
        c.forEach((g, k) => Object.assign(g, { collapsed: path[k].collapsed, pinned: !!path[k].pinned }))
        return c.at(-1).id
    })
    const pathNames = id => pathOf(gs, id)
    real.paths.forEach((path, k) => {
        if (path) {
            assert.strictEqual(pathNames(members[k]), path.map(p => p.name).join('/'), `tab ${k} keeps its group path`)
        }
    })
    for (const g of real.live ?? []) {
        const now = [...gs.values()].filter(x => x.name === g.name && (gs.get(x.parent)?.name ?? null) === g.parent)
        assert.strictEqual(now.length, 1, `group "${g.name}" survives once`)
        assert.strictEqual(now[0].color, g.color, `"${g.name}" keeps its colour`)
        assert.strictEqual(!!now[0].pinned, !!g.pinned, `"${g.name}" keeps its pin`)
        assert.strictEqual(members.filter(m => m === now[0].id).length, g.tabs, `"${g.name}" keeps its ${g.tabs} tabs`)
    }
    assert.strictEqual(gs.size, (real.live ?? [...gs.values()]).length, 'no group lost or added')
    console.log(`test-scope: real state: ${gs.size} groups, ${members.filter(Boolean).length} tabs migrated`)
}

console.log('test-scope: all passed')
