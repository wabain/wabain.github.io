import anim from 'animejs'

export function transitionContent(
    contentElem,
    newContentFragment,
    { hasManagedScroll }
) {
    if (!hasManagedScroll) {
        scrollWindowSmooth({ left: 0, top: 0 })
    }

    const tl = anim.timeline()

    tl.add({
        targets: contentElem,
        duration: 400,
        opacity: 0,
        easing: 'easeOutSine',
    }, '0')

    tl.add({
        targets: contentElem,
        duration: 400,
        opacity: 1,
        easing: 'easeInSine',

        begin() {
            contentElem.innerHTML = ''
            contentElem.appendChild(newContentFragment)
        },
    })

    return tl.finished
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
