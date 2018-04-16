import Parallax from './parallax'

function getParallaxTargets() {
    return Array.from(document.querySelectorAll('[data-scroll-distance]')).map((elem) => {
        const distance = parseFloat(elem.getAttribute('data-scroll-distance'))
        if (typeof distance === 'number' && distance === distance) {
            return [elem, distance]
        }
        return null
    }).filter((found) => found !== null)
}

const parallax = new Parallax({ elements: getParallaxTargets() })
parallax.install()
