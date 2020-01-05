import anim from 'animejs'

export function transitionContent({
    container: contentElem,
    attributes: {
        old: oldAttrs,
        new: newAttrs,
    },
    content: newContentFragment,
    navigation: { hasManagedScroll },
    beforeContentEnter,
}) {
    const body = document.body

    if (!hasManagedScroll) {
        scrollWindowSmooth({ left: 0, top: 0 })
    }

    const tl = anim.timeline()

    const changingLongform = oldAttrs.isLongform !== newAttrs.isLongform
    if (changingLongform) {
        const bodyOffset = getLongformBodyOffset()

        if (!newAttrs.isLongform) {
            body.classList.remove('content-longform')
            anim.set(body, { translateX: bodyOffset })
        }

        tl.add({
            targets: body,
            translateX: newAttrs.isLongform ? bodyOffset : 0,
            duration: 400,
            easing: 'easeInExpo',

            complete() {
                if (newAttrs.isLongform) {
                    body.classList.add('content-longform')
                }
                body.style.transform = null
            },
        })
    }

    tl.add({
        targets: contentElem,
        duration: 400,
        opacity: 0,
        easing: 'easeOutSine',
    }, changingLongform ? '-=200' : '0')

    tl.add({
        targets: contentElem,
        duration: 400,
        opacity: 1,
        easing: 'easeInSine',

        begin() {
            if (newAttrs.isLongform) {
                body.classList.add('content-longform')
            }

            contentElem.innerHTML = ''
            contentElem.appendChild(newContentFragment)

            if (beforeContentEnter) {
                beforeContentEnter()
            }
        },
    })

    return tl.finished
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
            const nonLongformPos = (body.clientWidth / 2) - (gridSize / 2)
            const longformPos = gridSize
            offset = longformPos - nonLongformPos
        }
    } finally {
        body.removeChild(bpCheck)
    }

    return offset
}

function scrollWindowSmooth({ left, top }) {
    const hasSmoothScroll = ('scrollBehavior' in document.documentElement.style)

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
