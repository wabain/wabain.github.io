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

    if (oldAttrs.isLongform !== newAttrs.isLongform) {
        let bodyOffset = getLongformBodyOffset()
        if (!newAttrs.isLongform) {
            bodyOffset = -bodyOffset
        }

        tl.add({
            targets: body,
            translateX: bodyOffset,
            duration: 400,
            easing: 'easeInExpo',
        })
    }

    tl.add({
        targets: contentElem,
        duration: 400,
        opacity: 0,
        easing: 'easeOutSine',
    }, tl.offset === 0 ? '0' : '-=200')

    tl.add({
        targets: contentElem,
        duration: 400,
        opacity: 1,
        easing: 'easeInSine',

        begin() {
            body.style.transform = null
            contentElem.style.transform = null

            if (newAttrs.isLongform) {
                body.classList.add('content-longform')
            } else {
                body.classList.remove('content-longform')
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
