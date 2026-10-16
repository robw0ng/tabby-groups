const fs = require('fs')

const h = (tag, props = {}, ...children) => {
    const el = Object.assign(document.createElement(tag), props)
    el.append(...children)
    return el
}
// Tabby's own row: title and description on the left, the switch in the right column.
const line = (title, description, control) => h('div', { className: 'form-line' },
    h('div', { className: 'header' }, h('div', { className: 'title', textContent: title }), h('div', { className: 'description', textContent: description })),
    control)
const toggle = (on, change) => h('div', { className: 'form-check form-switch ms-auto mb-0' },
    h('input', { className: 'form-check-input', type: 'checkbox', role: 'switch', checked: on, onchange: e => change(e.target.checked, e.target) }))

function readSettings (file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
        return e.code === 'ENOENT' ? {} : null
    }
}

/**
 * Settings > Tab groups. The switch is stored in tabby-groups.json, which the plugin watches, so the file stays the one
 * place for the plugin's settings. A file that does not parse is never overwritten.
 */
function renderSettings (host, file) {
    const settings = readSettings(file)
    const error = h('div', { className: 'text-danger mt-2' })
    const setAutoResume = (on, input) => {
        const current = readSettings(file)
        if (!current) {
            input.checked = !on
            error.textContent = `${file} is not valid JSON; fix it first.`
            return
        }
        fs.writeFileSync(file, JSON.stringify({ ...current, autoResume: on }, null, 2) + '\n')
        error.textContent = ''
    }
    host.replaceChildren(
        h('h3', { className: 'mb-3', textContent: 'Claude tabs' }),
        line('Resume Claude tabs after a restart',
            'Restored Claude tabs start again by themselves, two at a time, without a click. Off: a tab resumes when you first open it.',
            toggle(settings?.autoResume === true, setAutoResume)),
        error)
}

module.exports = { renderSettings }
