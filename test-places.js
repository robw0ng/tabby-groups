// node test-places.js: checks where empty groups sit (places.js), with no Tabby. On screen: picker.e2e.mjs.
const assert = require('assert')
const { unitsOf, emptyIndex, groupOrder, trackSlots, focusAfterClose, dropIndex, atOwnHeader } = require('./places')

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

console.log('test-places: all passed')
