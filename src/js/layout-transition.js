import debugFactory from 'debug'
import anim from 'animejs'

const debug = debugFactory('layout-transition')

export function transitionContent(
    contentElem,
    oldAttrs,
    newAttrs,
    newContentFragment,
    { hasManagedScroll }
) {
    const body = document.body


    if (!hasManagedScroll) {
        const hasSmoothScroll = ('scrollBehavior' in document.documentElement.style)

        if (hasSmoothScroll) {
            document.documentElement.scroll({
                top: 0,
                left: 0,
                behavior: 'smooth',
            })
        } else {
            // FIXME: still doesn't seem to work in Safari
            document.documentElement.scroll(0, 0)
        }
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
        },
    })

    return tl.finished
}

/**
 * Get difference of the offset of the start of primary content from the left
 * of the screen between longform to non-longform modes.
 */
function getLongformBodyOffset() {
    const body = document.body
    const bpCheck = document.createElement('div')
    bpCheck.className = 'layout-breakpoints'
    body.appendChild(bpCheck)

    const style = getComputedStyle(bpCheck)

    let offset
    if (style.content !== '"md"') {
        offset = 0
    } else {
        // FIXME: Less sloppy way to do this?
        const gridSize = parseFloat(style.backgroundSize)
        const nonLongformPos = (body.clientWidth / 2) - (gridSize / 2)
        const longformPos = gridSize
        offset = longformPos - nonLongformPos
    }

    body.removeChild(bpCheck)
    return offset
}
