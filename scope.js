// Group identity, with no Tabby. `groups` is the plugin's Map of groups by id: { id, name, parent (an id), color, ... }.
// The id is hidden and stable; the name is a label, unique only among its siblings (the groups with the same parent).
const { chainIn } = require('./places')

const newId = () => 'tg-' + Math.random().toString(36).slice(2, 10)

/** The child of `parent` (an id, or null for the top level) called `name`. */
const childNamed = (groups, parent, name) => [...groups.values()].find(g => (g.parent ?? null) === (parent ?? null) && g.name === name) ?? null

/** `name`, or the lowest free "name (n)", among the children of `parent`; `self` is the group being named, if any. */
function uniqueName (groups, parent, name, self = null) {
    const taken = n => [...groups.values()].some(g => g !== self && (g.parent ?? null) === (parent ?? null) && g.name === n)
    let n = 0
    while (taken(n ? `${name} (${n})` : name)) {
        n++
    }
    return n ? `${name} (${n})` : name
}

const pathOf = (groups, id) => chainIn(groups, id).map(g => g.name).join('/')

/**
 * The id a caller means: an id; a name that only one group has; a path of names ("tooling/maintainers"); or
 * { name, parent } with the parent itself any of these (null: the top level). Null when there is none.
 * Throws when a name fits several groups, so a script learns to give the path.
 */
function resolve (groups, ref) {
    if (ref == null) {
        return null
    }
    if (typeof ref === 'object') {
        const parent = ref.parent == null ? null : resolve(groups, ref.parent)
        return ref.parent != null && !parent ? null : childNamed(groups, parent, ref.name)?.id ?? null
    }
    if (groups.has(ref)) {
        return ref
    }
    const named = [...groups.values()].filter(g => g.name === ref)
    if (named.length > 1) {
        throw new Error(`tabby-groups: "${ref}" names ${named.length} groups; give its path, e.g. "${pathOf(groups, named[0].id)}"`)
    }
    if (named.length) {
        return named[0].id
    }
    let at = null
    for (const part of String(ref).split('/')) {
        at = childNamed(groups, at, part)?.id
        if (!at) {
            return null
        }
    }
    return at
}

/**
 * Adds saved groups (a reload's hand-over or the empty groups in localStorage) to `groups`. A group saved before ids
 * existed has none and names its parent by name; names were unique then, so the name finds the parent. Returns the
 * old name → id map, for tabs that still carry an old name. Never drops a group: an unknown parent makes it top level.
 */
function loadSaved (groups, saved) {
    const byName = new Map()
    const list = Array.isArray(saved) ? saved.filter(g => g && typeof g.name === 'string') : []
    for (const g of list) {
        const id = g.id ?? byName.get(g.name) ?? newId()
        if (!g.id) {
            byName.set(g.name, id)
        }
        groups.set(id, { ...g, id })
    }
    for (const g of list.filter(x => !x.id)) {
        const mine = groups.get(byName.get(g.name))
        mine.parent = g.parent == null ? null : byName.get(g.parent) ?? (groups.has(g.parent) ? g.parent : null)
    }
    return byName
}

/**
 * The group a restored tab joins, from the path its recovery token carries (root first): each entry is found by its
 * id, else by its name under the entry before it (an old token has names only), else made with its saved id. Each
 * takes its saved colour; the caller sets fold and pin. Returns the groups, root first.
 */
function restorePath (groups, path) {
    let parent = null
    const out = []
    for (const p of path) {
        let g = (p.id && groups.get(p.id)) || childNamed(groups, parent, p.name)
        if (!g) {
            const id = p.id && !groups.has(p.id) ? p.id : newId()
            g = { id, name: uniqueName(groups, parent, p.name), color: p.color ?? null, collapsed: false, parent, pinned: false }
            groups.set(id, g)
        }
        if (p.color !== undefined) {
            g.color = p.color
        }
        parent = g.id
        out.push(g)
    }
    return out
}

module.exports = { newId, childNamed, uniqueName, pathOf, resolve, loadSaved, restorePath }
