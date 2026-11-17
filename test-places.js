// node test-places.js: checks where empty groups sit (places.js), with no Tabby. On screen: picker.e2e.mjs.
const assert = require('assert')
const { unitsOf, emptyIndex, groupOrder, trackSlots, focusAfterClose, dropIndex, atOwnHeader, emptyDrop, placeInOrder } = require('./places')

const tab = (name, group) => ({ name, __tg: group })
const mk = (...gs) => new Map(gs.map(g => [g.name, { parent: null, id: g.name, ...g }]))
const names = xs => xs.map(x => x.name)

// Top level: loose a, group G (g1, g2), loose b. Empty E sits after the first unit, empty S at the end of G.
let a = tab('a'), g1 = tab('g1', 'G'), g2 = tab('g2', 'G'), b = tab('b')
let tabs = [a, g1, g2, b]
let groups = mk({ name: 'G' }, { name: 'E', slot: 1 }, { name: 'S', parent: 'G', slot: 2 }, { name: 'Old' })
assert.deepStrictEqual(names(unitsOf(tabs, groups, null).map(u => u.unit)), ['a', 'G', 'b'])
assert.deepStrictEqual(names(groupOrder(tabs, groups)), ['E', 'G', 'S', 'Old'], 'empty groups at their slots; no slot goes last')
assert.strictEqual(emptyIndex(tabs, groups, groups.get('E')), 1, 'a tab for E goes before G')
assert.strictEqual(emptyIndex(tabs, groups, groups.get('S')), 3, 'a tab for S goes after G\'s last tab')
assert.strictEqual(emptyIndex(tabs, groups, groups.get('Old')), 4, 'no slot: the end of the list')
assert.strictEqual(emptyIndex(tabs, groups, groups.get('E'), [a]), 1, 'a moving tab still counts: E stays before G')
const t = tab('t')
assert.strictEqual(emptyIndex([a, t, b], mk({ name: 'E', slot: 2 }), { name: 'E', parent: null, slot: 2 }, [t]), 2, 't moving into E, after a and t: before b')

// An empty subgroup of an empty group takes its parent's place.
groups = mk({ name: 'P', slot: 0 }, { name: 'C', parent: 'P', slot: 5 })
assert.strictEqual(emptyIndex([a, b], groups, groups.get('C')), 0)
assert.deepStrictEqual(names(groupOrder([a, b], groups)), ['P', 'C'])
// A group whose parent is not there counts as top level.
groups = mk({ name: 'K', parent: 'Gone', slot: 1 })
assert.deepStrictEqual(names(groupOrder([a, b], groups)), ['K'])
assert.strictEqual(emptyIndex([a, b], groups, groups.get('K')), 1)

// A group that becomes empty keeps its place, and stays there as other units in its panel close, come or move.
const c = tab('c'), d = tab('d'), x = tab('x')
const slotAfter = (steps, group = 'G') => {
    const gs = mk({ name: group })
    const marks = new Map()
    for (const step of steps) {
        step.forEach(t => t.__tg = t.name.startsWith('g') ? group : undefined)
        trackSlots(step, gs, marks)
    }
    return gs.get(group).slot
}
const ga = tab('g1')
assert.strictEqual(slotAfter([[a, ga, b, c], [a, b, c]]), 1, 'emptied: still after a')
assert.strictEqual(slotAfter([[a, ga, b, c], [a, b, c], [b, c]]), 0, 'a closed: still before b')
assert.strictEqual(slotAfter([[a, ga, b, c], [a, b, c], [a, b, c, d]]), 1, 'd added at the end: still before b')
assert.strictEqual(slotAfter([[a, ga, b], [tab('moved'), a, b]]), 2, 'its last tab dragged out above a in the same change: still after a')
assert.strictEqual(slotAfter([[x, a, ga, b], [x, a, b], [x, b, a]]), 1, 'a dragged to the end: still between x and b')
assert.strictEqual(slotAfter([[x, a, ga, b], [x, a, b], [b, x, a]]), 3, 'b dragged to the front: still after a')


// After a restart the tabs come back one by one; the saved slot waits until its units are there.
groups = mk({ name: 'E', slot: 2 })
const fresh = new Map()
for (tabs of [[], [a], [a, b], [a, b, c]]) {
    trackSlots(tabs, groups, fresh)
}
assert.strictEqual(groups.get('E').slot, 2, 'restored: after a and b')

// The tab after a close: the most recent of its group, else the most recent anywhere; or the tab above; or Tabby's own.
{
    const [x, y, z, w, v] = ['x', 'y', 'z', 'w', 'v'].map(n => tab(n, ['y', 'z', 'w'].includes(n) ? 'G' : undefined))
    const list = [x, y, z, w, v]
    assert.strictEqual(focusAfterClose(list, [z, v, w, y, x], z, 'recent'), w, 'the most recent other tab of its group')
    assert.strictEqual(focusAfterClose(list, [x, v, w], x, 'recent'), v, 'a tab in no group: the most recent tab')
    assert.strictEqual(focusAfterClose([x, y, v], [y, v, x], y, 'recent'), v, 'the last of its group: the most recent tab')
    assert.strictEqual(focusAfterClose(list, [], z, 'recent'), null, "no recent list: Tabby's own")
    assert.strictEqual(focusAfterClose(list, [z, w], z, 'previous'), y)
    assert.strictEqual(focusAfterClose(list, [z, w], x, 'previous'), y, 'the first tab: the one below')
    assert.strictEqual(focusAfterClose(list, [z, w], z, 'next'), null, "next: Tabby's own choice")
    assert.strictEqual(focusAfterClose([x], [x], x, 'recent'), null, 'the last tab: nothing to show')
}

// A drop's index: beside its own place it stays; elsewhere it lands exactly at the line, up or down.
{
    const move = (list, from, to) => { const l = [...list]; l.splice(to, 0, ...l.splice(from, 1)); return l }
    const list = ['a', 'b', 'c', 'x', 'd', 'e']
    const x = list.indexOf('x')
    assert.strictEqual(dropIndex(x, x - 1, true), x, 'after the tab above it: stays')
    assert.strictEqual(dropIndex(x, x + 1, false), x, 'before the tab below it: stays')
    for (const [anchor, after, want] of [[0, false, 'x,a,b,c,d,e'], [1, true, 'a,b,x,c,d,e'], [4, true, 'a,b,c,d,x,e'], [5, true, 'a,b,c,d,e,x'], [5, false, 'a,b,c,d,x,e']]) {
        assert.strictEqual(move(list, x, dropIndex(x, anchor, after)).join(), want, `${after ? 'after' : 'before'} ${list[anchor]}`)
    }
}

// A dragged group G: the line under a tab whose next shown row is G's own header is G's own place (no drop); a row
// between them (another group's header or footer, an empty group) makes it a real move.
assert.strictEqual(atOwnHeader({ header: true, group: 'G' }, 'G'), true, 'the group above touches G: its own place')
assert.strictEqual(atOwnHeader({ header: true, group: 'P' }, 'G'), false, "a parent's header between: taking G out of P is a real move")
assert.strictEqual(atOwnHeader({ header: false, group: 'H' }, 'G'), false, "a sibling's footer between: a real move")
assert.strictEqual(atOwnHeader(null, 'G'), false, 'the last row: a real move')

// An empty group dropped somewhere: emptyDrop's slot and order, applied as the plugin does (placeInOrder, its marks
// dropped, then trackSlots), show it at the drop line. Top level: a, G (g1, g2), b. Empty X before a, Y before G, Z at
// the end, and I inside G.
{
    const a = tab('a'), g1 = tab('g1', 'G'), g2 = tab('g2', 'G'), b = tab('b')
    const tabs = [a, g1, g2, b]
    const fresh = () => mk({ name: 'X', slot: 0 }, { name: 'G' }, { name: 'Y', slot: 1 }, { name: 'Z', slot: 3 }, { name: 'I', parent: 'G', slot: 0 })
    const order = (gs, panel = null) => names(groupOrder(tabs, gs, panel))
    const dropAt = (name, i) => {
        const gs = fresh()
        const g = gs.get(name)
        const d = emptyDrop(tabs, gs, g, typeof i === 'function' ? i(gs) : i)
        g.parent = d.parent
        g.slot = d.slot
        placeInOrder(gs, g, d.order)
        trackSlots(tabs, gs, new Map())
        return gs
    }
    assert.deepStrictEqual(order(fresh()), ['X', 'Y', 'G', 'I', 'Z'])
    // Same parent, another place: the bug was that nothing moved.
    let gs = dropAt('Z', { tab: a, where: 'after' })
    assert.deepStrictEqual([gs.get('Z').slot, order(gs)], [1, ['X', 'Z', 'Y', 'G', 'I']], 'after a: first at its slot, above Y')
    gs = dropAt('X', { tab: b, where: 'before' })
    assert.deepStrictEqual([gs.get('X').slot, order(gs)], [2, ['Y', 'G', 'I', 'X', 'Z']], 'before b')
    // Beside another empty group: its slot, just above or below it.
    gs = dropAt('Z', g => ({ group: g.get('X'), where: 'above' }))
    assert.deepStrictEqual([gs.get('Z').slot, order(gs)], [0, ['Z', 'X', 'Y', 'G', 'I']], 'above X')
    gs = dropAt('Z', g => ({ group: g.get('X'), where: 'below' }))
    assert.deepStrictEqual([gs.get('Z').slot, order(gs)], [0, ['X', 'Z', 'Y', 'G', 'I']], 'below X')
    // Beside a group with tabs: just above it (after the empties at its slot), or just below it.
    gs = dropAt('X', g => ({ group: g.get('G'), where: 'above' }))
    assert.deepStrictEqual([gs.get('X').slot, order(gs)], [1, ['Y', 'X', 'G', 'I', 'Z']], 'above G')
    gs = dropAt('Z', g => ({ group: g.get('G'), where: 'below' }))
    assert.deepStrictEqual([gs.get('Z').slot, order(gs)], [2, ['X', 'Y', 'G', 'I', 'Z']], 'below G')
    // Inside a group, first or last.
    gs = dropAt('X', g => ({ group: g.get('G'), where: 'first' }))
    assert.deepStrictEqual([gs.get('X').parent, gs.get('X').slot, order(gs, 'G')], ['G', 0, ['X', 'I']], 'first in G')
    gs = dropAt('X', g => ({ group: g.get('G'), where: 'last' }))
    assert.deepStrictEqual([gs.get('X').parent, gs.get('X').slot, order(gs, 'G')], ['G', 2, ['I', 'X']], 'last in G')
    // The free space below the rows: the end, above the empty groups already there.
    gs = dropAt('X', { where: 'end' })
    assert.deepStrictEqual([gs.get('X').slot, order(gs)], [3, ['Y', 'G', 'I', 'X', 'Z']], 'end')
    // Out of its group, after a tab at the top level.
    gs = dropAt('I', { tab: b, where: 'after' })
    assert.deepStrictEqual([gs.get('I').parent, gs.get('I').slot, order(gs)], [null, 3, ['X', 'Y', 'G', 'I', 'Z']], 'out of G, after b')
    // The groups Map keeps every group, keyed by id.
    assert.deepStrictEqual([...gs.keys()].sort(), ['G', 'I', 'X', 'Y', 'Z'])
}

console.log('test-places: all passed')
