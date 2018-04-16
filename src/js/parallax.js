export default class Parallax {
    constructor({
        scrollElem = document.querySelector('html'),
        elements
    }) {
        this.scrollElem = scrollElem
        this.elements = elements
        this._updatePending = false
        this._boundUpdate = () => { this._update() }
    }

    requestUpdate() {
        if (this._updatePending) {
            return
        }

        requestAnimationFrame(this._boundUpdate)
        this._updatePending = true
    }

    _update() {
        const scrollTop = Math.max(this.scrollElem.scrollTop, document.body.scrollTop)
        const elements = this.elements
        const elemCount = elements.length

        for (let i = 0; i < elemCount; i++) {
            const [child, factor] = elements[i]

            const translateAmount = scrollTop - scrollTop * factor

            if (translateAmount === 0) {
                child.style.transform = ''
            } else {
                child.style.transform = `translateY(${translateAmount}px)`
            }
        }

        this._updatePending = false
    }

    install() {
        window.addEventListener('scroll', () => { this.requestUpdate() }, false)
    }
}
