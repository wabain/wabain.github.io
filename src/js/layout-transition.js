import anim from 'animejs'

export function transitionContent({
    container: contentElem,
    attributes: { old: oldAttrs, new: newAttrs },
    content: newContentFragment,
    navigation: { hasManagedScroll },
    beforeContentEnter,
}) {
    if (!hasManagedScroll) {
        scrollWindowSmooth({ left: 0, top: 0 })
    }

    return transitionOut(contentElem, oldAttrs, newAttrs).then(() => {
        contentElem.innerHTML = ''
        contentElem.appendChild(newContentFragment)

        if (beforeContentEnter) {
            beforeContentEnter()
        }

        return transitionIn(contentElem)
    })
}

function transitionOut(contentElem, oldAttrs, newAttrs) {
    const body = document.body
    const tl = anim.timeline()

    const changingLongform = oldAttrs.isLongform !== newAttrs.isLongform

    if (changingLongform) {
        const bodyOffset = getLongformBodyOffset()

        tl.add({
            targets: body,
            translateX: newAttrs.isLongform ? bodyOffset : -bodyOffset,
            duration: 400,
            easing: 'easeInExpo',
        })
    }

    tl.add(
        {
            targets: contentElem,
            duration: 400,
            opacity: 0,
            easing: 'easeOutSine',
        },
        changingLongform ? '-=200' : '0',
    )

    return tl.finished.then(() => {
        if (!changingLongform) {
            return
        }

        if (newAttrs.isLongform) {
            body.classList.add('content-longform')
        } else {
            body.classList.remove('content-longform')
        }

        body.style.transform = null
    })
}

function transitionIn(contentElem) {
    return anim({
        targets: contentElem,
        duration: 400,
        opacity: 1,
        easing: 'easeInSine',
    }).finished
}

/**
 * Get difference of the offset of the start of primary content from the left
 * of the screen between longform to non-longform modes.
 *
 * See the style definition for a description of .layout-breakpoints.
 */
function getLongformBodyOffset() {
    const body = document.body
    const bpCheck = document.createElement('div')
    bpCheck.className = 'layout-breakpoints'
    body.appendChild(bpCheck)

    let offset
    try {
        const style = getComputedStyle(bpCheck)

        if (style.content !== '"md"') {
            offset = 0
        } else {
            const gridSize = parseFloat(style.backgroundSize)
            const nonLongformPos = body.clientWidth / 2 - gridSize / 2
            const longformPos = gridSize
            offset = longformPos - nonLongformPos
        }
    } finally {
        body.removeChild(bpCheck)
    }

    return offset
}

function scrollWindowSmooth({ left, top }) {
    const hasSmoothScroll = 'scrollBehavior' in document.documentElement.style

    if (hasSmoothScroll) {
        window.scroll({
            left,
            top,
            behavior: 'smooth',
        })
    } else {
        window.scroll(left, top)
    }
}
