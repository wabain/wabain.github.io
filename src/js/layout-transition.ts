import anim from 'animejs'
import type { ContentAttributes } from './dynamic-navigation'

export type LayoutTransitionNavigationParameters = {
    hasManagedScroll: boolean
}

export type ContentTransitionParameters = {
    container: Element
    attributes: { old: ContentAttributes; new: ContentAttributes }
    content: DocumentFragment
    navigation: LayoutTransitionNavigationParameters
    beforeContentEnter?: () => void
}

export function transitionContent({
    container: contentElem,
    attributes: { old: oldAttrs, new: newAttrs },
    content: newContentFragment,
    navigation: { hasManagedScroll },
    beforeContentEnter,
}: ContentTransitionParameters): Promise<void> {
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

function transitionOut(
    contentElem: Element,
    oldAttrs: ContentAttributes,
    newAttrs: ContentAttributes,
): Promise<void> {
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

        body.style.transform = ''
    })
}

function transitionIn(contentElem: Element): Promise<void> {
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
 * See the style definition for a description of `grid-layout-meta`.
 */
function getLongformBodyOffset(): number {
    const body = document.body

    const grid = document.createElement('div')
    grid.className = 'grid-base'

    const bpCheck = document.createElement('div')
    bpCheck.style.gridArea = 'primary'
    grid.appendChild(bpCheck)

    body.appendChild(grid)

    let offset
    try {
        grid.classList.add('content-longform-override--false')
        const { left: nonLongform } = bpCheck.getBoundingClientRect()

        grid.classList.replace(
            'content-longform-override--false',
            'content-longform-override--true',
        )
        const { left: longform } = bpCheck.getBoundingClientRect()

        offset = longform - nonLongform
    } finally {
        body.removeChild(grid)
    }

    return offset
}

function scrollWindowSmooth({
    left,
    top,
}: {
    left: number
    top: number
}): void {
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
