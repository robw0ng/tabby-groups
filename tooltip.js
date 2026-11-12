/** Tooltips for any element with data-tg-tip, in Tabby's own tooltip look. */
function createTooltip () {
    // Bootstrap's "tooltip bs-tooltip-top", as ngbTooltip renders a tab's; shown after the same short rest.
    const TIP_DELAY = 500
    let tipEl = null
    let tipHost = null
    let tipTimer = null
    // The delay ended while its row was being redrawn: the twin shows the tip as soon as the pointer meets it.
    let tipDue = false
    function hideTip () {
        clearTimeout(tipTimer)
        tipEl?.remove()
        tipEl = tipHost = null
        tipDue = false
    }
    function onTipOver (e) {
        const host = e.target.closest?.('[data-tg-tip]')
        // Its row gone and the pointer on no other: nothing is left to point at.
        if (!host && tipHost && !tipHost.isConnected) {
            hideTip()
        }
        if (!host || host === tipHost) {
            return
        }
        // A redraw replaced the hovered row (a group header is rebuilt on every change): the tip moves to its twin, with
        // the new text and place, instead of hiding and waiting again.
        if (tipHost && !tipHost.isConnected) {
            tipHost = host
            if (tipEl) {
                tipEl.querySelector('.tooltip-inner').textContent = host.dataset.tgTip
                place(host)
            } else if (tipDue) {
                showTip(host)
            }
            return
        }
        hideTip()
        tipHost = host
        // The host when the delay ends: a redraw meanwhile hands it to the twin.
        tipTimer = setTimeout(() => showTip(tipHost), TIP_DELAY)
    }
    function place (host) {
        tipEl.style.left = tipEl.style.top = '0px'
        const h = host.getBoundingClientRect()
        const t = tipEl.getBoundingClientRect()
        const left = Math.max(4, Math.min(innerWidth - t.width - 4, h.left + h.width / 2 - t.width / 2))
        Object.assign(tipEl.style, { left: left + 'px', top: h.top - t.height + 'px' })
        // ngbTooltip's positioning library sets the arrow absolute; Bootstrap's bs-tooltip-top rule then puts it below the box.
        const arrow = tipEl.querySelector('.tooltip-arrow')
        arrow.style.position = 'absolute'
        arrow.style.left = h.left + h.width / 2 - left - arrow.offsetWidth / 2 + 'px'
    }
    function showTip (host) {
        if (!host?.isConnected) {
            tipDue = !!host
            return
        }
        tipDue = false
        tipEl = document.createElement('div')
        // Without "show" at first, so Bootstrap's opacity transition fades it in when "show" follows on the next frame.
        tipEl.className = 'tooltip fade bs-tooltip-top tg-tip'
        tipEl.setAttribute('role', 'tooltip')
        tipEl.innerHTML = '<div class="tooltip-arrow"></div><div class="tooltip-inner"></div>'
        tipEl.querySelector('.tooltip-inner').textContent = host.dataset.tgTip
        // Positioned before it is measured: until then Bootstrap's box spans the page width.
        Object.assign(tipEl.style, { position: 'fixed', left: 0, top: 0, margin: 0 })
        document.body.appendChild(tipEl)
        place(host)
        const shown = tipEl
        requestAnimationFrame(() => requestAnimationFrame(() => shown.classList.add('show')))
    }
    // Leaving for a row's twin (the next mouseover adopts it) is not leaving.
    const onTipOut = e => {
        const to = e.relatedTarget?.closest?.('[data-tg-tip]')
        if (tipHost && !tipHost.contains(e.relatedTarget) && !(to && !tipHost.isConnected)) {
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
