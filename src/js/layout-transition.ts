import type { ContentAttributes } from './dynamic-navigation'

const BODY_SLIDE_DURATION = 400
const CONTENT_FADE_DURATION = 400

// Cubic bezier approximations of the Penner easing functions, as listed at
// https://easings.net
const EASE_IN_EXPO = 'cubic-bezier(0.7, 0, 0.84, 0)'
const EASE_OUT_SINE = 'cubic-bezier(0.61, 1, 0.88, 1)'
const EASE_IN_SINE = 'cubic-bezier(0.12, 0, 0.39, 0)'

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

// Async so that synchronous errors reach the caller as a rejection
export async function transitionContent({
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

    const changingLongform = oldAttrs.isLongform !== newAttrs.isLongform

    let bodySlide: Animation | null = null

    if (changingLongform) {
        const bodyOffset = getLongformBodyOffset()
        const translateX = newAttrs.isLongform ? bodyOffset : -bodyOffset

        bodySlide = startAnimation(
            body,
            { transform: `translateX(${translateX}px)` },
            {
                duration: BODY_SLIDE_DURATION,
                easing: EASE_IN_EXPO,
                fill: 'forwards',
            },
        )
    }

    const contentFadeOut = startAnimation(
        contentElem,
        { opacity: 0 },
        {
            duration: CONTENT_FADE_DURATION,
            delay: changingLongform ? BODY_SLIDE_DURATION - 200 : 0,
            easing: EASE_OUT_SINE,
            fill: 'forwards',
        },
    )

    const finished = Promise.all([
        bodySlide?.finished,
        contentFadeOut?.finished,
    ])

    return finished.then(() => {
        if (!changingLongform) {
            return
        }

        // Release the slide's offset in the same task as the class
        // change, so no frame renders the new layout still offset
        bodySlide?.cancel()

        if (newAttrs.isLongform) {
            body.classList.add('content-longform')
        } else {
            body.classList.remove('content-longform')
        }
    })
}

function transitionIn(contentElem: Element): Promise<void> {
    // Once this finishes, the browser removes the fade out it replaces
    const contentFadeIn = startAnimation(
        contentElem,
        { opacity: [0, 1] },
        {
            duration: CONTENT_FADE_DURATION,
            easing: EASE_IN_SINE,
            fill: 'forwards',
        },
    )

    return Promise.resolve(contentFadeIn?.finished).then(() => {})
}

/**
 * Start an animation using the Web Animations API, or return null if the
 * browser doesn't support it.
 */
function startAnimation(
    elem: Element,
    keyframes: PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
): Animation | null {
    if (!hasWebAnimations()) {
        return null
    }

    return elem.animate(keyframes, options)
}

function hasWebAnimations(): boolean {
    return (
        'animate' in Element.prototype &&
        typeof Animation !== 'undefined' &&
        'finished' in Animation.prototype
    )
}

/**
 * Get difference of the offset of the start of primary content from the left
 * of the screen between longform to non-longform modes.
 *
 * See the style definition for a description of `grid-base`.
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
