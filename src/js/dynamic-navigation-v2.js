import debugFactory from 'debug'
import { getDomainRelativeUrl, isRelativeHref, isCurrentLocation } from './normalize-href'

const debug = debugFactory('dynamic-navigation[v2]')

/**
 * Parse the document's title. The base title is all text up to the final "-",
 * excluding trailing whitespace. Subsequent text is the page title.
 */
function parseTitle(title) {
    // XXX: should use first `-`?
    const parsed = (/(.*?)(?:\s*-\s*([^-]*))?$/).exec(title)
    return {
        base: parsed[1],
        page: parsed[2] || null,
    }
}

export class DynamicNavDispatcher {
    constructor() {
        this._handleClick = this._handleClick.bind(this)
        this._handlePopState = this._handlePopState.bind(this)

        this.cache = {}
        this._fetchIdx = 0

        this.root = this.contentElem = this.navElem = null
        this.baseTitle = parseTitle(document.title).base

        // Only initialize dynamic navigation if HTML5 history APIs are available
        if (!window.history || !window.history.pushState) {
            debug('bailing on initialization, no support for history api')
            return
        }

        // Regions
        this.root = document.body
        this.contentElem = document.querySelector('[data-region-id="primary-content"]')
        this.navElem = document.querySelector('[data-region-id="page-header"]')

        if (!(this.root && this.contentElem && this.navElem)) {
            debug('bailing, failed to find content element (url %s)', location.href)
            return
        }

        this.cache[getDomainRelativeUrl(location.href)] =
            Promise.resolve({ content: this.contentElem.innerHTML })

        this.root.addEventListener('click', this._handleClick, false)
        window.addEventListener('popstate', this._handlePopState, false)
    }

    _handleClick(evt) {
        const anchor = findAnchor(evt.target, evt.currentTarget)
        if (!anchor)
            return

        if (isCurrentLocation(anchor.href) || !isRelativeHref(anchor.href))
            return

        evt.preventDefault()
        history.pushState({ handler: 'DynamicNavDispatcher/click' }, '', anchor.href)
        this._handleNavigation(anchor.href)
    }

    _handlePopState() {
        this._handleNavigation(location.href)
    }

    _handleNavigation(href) {
        const relative = getDomainRelativeUrl(href)
        if (!relative)
            throw new Error('unexpected navigation to ' + href)

        debug('dynamic navigation triggered (href %s)', relative)

        this._setDocTitle(null)
        this._updateNavLinks({ active: relative })
        this._loadContent(relative)
    }

    _updateNavLinks({ active }) {
        const collection = this.navElem.getElementsByTagName('a')
        const len = collection.length

        for (let i = 0; i < len; i++) {
            const elem = collection[i]
            if (getDomainRelativeUrl(elem.href) === active) {
                elem.classList.add('active-link')
            } else {
                elem.classList.remove('active-link')
            }
        }
    }

    _loadContent(href) {
        const { idx, promise } = this._getOrFetch(href)

        promise.then(({ content }) => {
            if (this._fetchIdx !== idx) {
                debug('load %s: old fetch; bailing from load', href)
                return
            }

            debug('load %s: updating content', href)
            this.contentElem.innerHTML = content

            const title = this.contentElem.children ?
                this.contentElem.children[0].getAttribute('data-page-meta') :
                null

            const isLongform = this.contentElem.children ?
                this.contentElem.children[0].hasAttribute('data-content-longform') :
                false

            this._setDocTitle(title)
            this._setContentLongform(isLongform)
        }).catch((err) => {
            debug('load %s: fatal: %s', href, err)
            location.reload()
        })
    }

    _getOrFetch(href) {
        const idx = ++this._fetchIdx

        if (this.cache.hasOwnProperty(href)) {
            debug('load %s: using cached promise', href)
        } else {
            const cacheUrl = '/section-partial' + (href === '/' ? '/index.html' : href)
            debug('load %s: requesting partial %s', href, cacheUrl)

            this.cache[href] = fetch(cacheUrl).then((res) => {
                if (!res.ok)
                    throw new Error('network error: ' + res.status + ' ' + res.statusText)

                return res.text()
            }).then((text) => {
                return { content: text }
            })
        }

        return { idx, promise: this.cache[href] }
    }

    _setDocTitle(title) {
        if (title) {
            document.title = this.baseTitle + ' - ' + title
        } else {
            document.title = this.baseTitle
        }
    }

    _setContentLongform(isLongform) {
        if (isLongform) {
            this.root.classList.add('content-longform')
        } else {
            this.root.classList.remove('content-longform')
        }
    }
}

function findAnchor(elem, guard) {
    while (elem && elem !== guard) {
        if (elem.nodeName === 'A')
            return elem

        elem = elem.parentElement
    }

    return null
}
