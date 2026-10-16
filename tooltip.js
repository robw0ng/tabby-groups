/** Tooltips for any element with data-tg-tip, in Tabby's own tooltip look. */
function createTooltip () {
    // Bootstrap's "tooltip bs-tooltip-top", as ngbTooltip renders a tab's; shown after the same short rest.
    const TIP_DELAY = 500
    let tipEl = null
    let tipHost = null
    let tipTimer = null
    function hideTip () {
        clearTimeout(tipTimer)
        tipEl?.remove()
        tipEl = tipHost = null
    }
    function onTipOver (e) {
        const host = e.target.closest?.('[data-tg-tip]')
        if (!host || host === tipHost) {
            return
        }
        hideTip()
        tipHost = host
        tipTimer = setTimeout(() => showTip(host), TIP_DELAY)
    }
    function showTip (host) {
        if (!host.isConnected) {
            return
        }
        tipEl = document.createElement('div')
        // Without "show" at first, so Bootstrap's opacity transition fades it in when "show" follows on the next frame.
        tipEl.className = 'tooltip fade bs-tooltip-top tg-tip'
        tipEl.setAttribute('role', 'tooltip')
        tipEl.innerHTML = '<div class="tooltip-arrow"></div><div class="tooltip-inner"></div>'
        tipEl.querySelector('.tooltip-inner').textContent = host.dataset.tgTip
        // Positioned before it is measured: until then Bootstrap's box spans the page width.
        Object.assign(tipEl.style, { position: 'fixed', left: 0, top: 0, margin: 0 })
        document.body.appendChild(tipEl)
        const h = host.getBoundingClientRect()
        const t = tipEl.getBoundingClientRect()
        const left = Math.max(4, Math.min(innerWidth - t.width - 4, h.left + h.width / 2 - t.width / 2))
        Object.assign(tipEl.style, { left: left + 'px', top: h.top - t.height + 'px' })
        // ngbTooltip's positioning library sets the arrow absolute; Bootstrap's bs-tooltip-top rule then puts it below the box.
        const arrow = tipEl.querySelector('.tooltip-arrow')
        arrow.style.position = 'absolute'
        arrow.style.left = h.left + h.width / 2 - left - arrow.offsetWidth / 2 + 'px'
        const shown = tipEl
        requestAnimationFrame(() => requestAnimationFrame(() => shown.classList.add('show')))
    }
    const onTipOut = e => {
        if (tipHost && !tipHost.contains(e.relatedTarget)) {
            hideTip()
        }
    }
    document.addEventListener('mouseover', onTipOver, true)
    document.addEventListener('mouseout', onTipOut, true)
    document.addEventListener('mousedown', hideTip, true)

    function dispose () {
        document.removeEventListener('mouseover', onTipOver, true)
        document.removeEventListener('mouseout', onTipOut, true)
        document.removeEventListener('mousedown', hideTip, true)
        hideTip()
    }
    return { hideTip, dispose }
}

module.exports = { createTooltip }
