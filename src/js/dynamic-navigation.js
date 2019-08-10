import debugFactory from 'debug'
import {
    getDomainRelativeUrl,
    isHashChange,
    isRelativeHref,
    isCurrentLocation,
} from './normalize-href'
import { transitionContent } from './layout-transition'

const debug = debugFactory('dynamic-navigation')

/**
 * Parse the document's title. The base title is all text up to the first "-",
 * excluding trailing whitespace. Subsequent text is the page title.
 */
function parseTitle(title) {
    const parsed = (/(.*?)(?:\s*-\s*(.*))?$/).exec(title)
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

        this._lastHref = location.href

        // Only initialize dynamic navigation if HTML5 history APIs are available
        if (!window.history || !window.history.pushState) {
            debug('bailing on initialization, no support for history api')
            return
        }

        this.pageTrans = PageTransformer.forDocument(document)
        if (!this.pageTrans) {
            debug('bailing, failed to find expected page areas (url %s)', location.href)
            return
        }

        this.cache[getDomainRelativeUrl(location.href)] =
            Promise.resolve({ content: this.pageTrans.currentContent })

        this.pageTrans.root.addEventListener('click', this._handleClick, false)
        window.addEventListener('popstate', this._handlePopState, false)
    }

    _handleClick(evt) {
        const anchor = findAnchor(evt.target, evt.currentTarget)
        if (!anchor)
            return

        if (isCurrentLocation(anchor.href) ||
                isHashChange(anchor.href) ||
                !isRelativeHref(anchor.href) ||
                hasModifierKey(evt))
            return

        evt.preventDefault()
        history.pushState({ handler: 'DynamicNavDispatcher/click' }, '', anchor.href)

        this._lastHref = anchor.href
        this._handleNavigation(anchor.href, { hasManagedScroll: false })
    }

    _handlePopState() {
        const hashChange = isHashChange(this._lastHref)

        this._lastHref = location.href

        if (hashChange)
            return

        this._handleNavigation(location.href, { hasManagedScroll: true })
    }

    _handleNavigation(href, options) {
        const relative = getDomainRelativeUrl(href)
        if (!relative)
            throw new Error('unexpected navigation to ' + href)

        debug('dynamic navigation triggered (href %s)', relative)
        this._loadContent(relative, options)
    }

    _loadContent(href, options) {
        this.pageTrans.setContentPending(true)
        const { idx, promise } = this._getOrFetch(href)

        promise.then(({ content }) => {
            if (this._fetchIdx !== idx) {
                debug('load %s: old fetch; bailing from load', href)
                return
            }

            debug('load %s: updating content', href)
            this.pageTrans.receivedContent(href, content, options)
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
}

function hasModifierKey(evt) {
    return (evt.ctrlKey || evt.metaKey || evt.shiftKey)
}

class TimedCallback {
    constructor(fn, duration, key = '') {
        this.complete = this.cancelled = false
        this._id = setTimeout(() => {
            this.complete = true
            debug('Timer expired, %ss %s', duration, key)
            fn()
        }, duration)
    }

    cancel() {
        this.complete = this.cancelled = true
        clearTimeout(this._id)
    }
}

class PageTransformer {
    constructor({ baseTitle, root, navElem, contentElem }) {
        this.baseTitle = baseTitle
        this.root = root
        this.navElem = navElem
        this.contentElem = contentElem

        this.contentPending = false

        this._slow = this._fadeOut = this._fadeIn = null
    }

    static forDocument(document) {
        const root = document.body
        const contentElem = document.querySelector('[data-region-id="primary-content"]')
        const navElem = document.querySelector('[data-region-id="page-header"]')

        if (!(root && contentElem && navElem)) {
            return null
        }

        const { base: baseTitle, page: pageTitle } = parseTitle(document.title)
        debug('initial mount, base title %s, page title %s', baseTitle, pageTitle)

        return new PageTransformer({ baseTitle, root, contentElem, navElem })
    }

    get currentContent() {
        return this.contentElem.innerHTML
    }

    setContentPending(value) {
        if (value === this.contentPending)
            return

        this.contentPending = value

        if (value) {
            this._slow = new TimedCallback(() => {
                this._contentPendingSlow()
            }, 750)
        } else {
            if (this._slow) {
                this._slow.cancel()
                this._slow = null
            }
        }
    }

    _contentPendingSlow() {
        // XXX: Fill this in
        debug('content load is slow, should show a spinner')
    }

    receivedContent(href, content, options) {
        this.setContentPending(false)

        const temp = document.createElement('div')
        temp.innerHTML = content

        const frag = document.createDocumentFragment()
        while (temp.firstChild !== null) {
            frag.appendChild(temp.firstChild)
        }

        const oldAttrs = getContentAttributes(this.contentElem)
        const newAttrs = getContentAttributes(frag)

        this._setDocTitle(newAttrs.title)
        this._updateNavLinks({ active: href })

        transitionContent(this.contentElem, oldAttrs, newAttrs, frag, options).catch((err) => {
            debug('load %s: transition: fatal: %s', href, err)
            location.reload()
        })
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

    _setDocTitle(title) {
        if (title) {
            document.title = this.baseTitle + ' - ' + title
        } else {
            document.title = this.baseTitle
        }
    }
}

function getContentAttributes(root) {
    if (!root.children) {
        return { title: null, isLongform: false }
    }

    const e = root.children[0]

    return {
        title: e.getAttribute('data-page-meta'),
        isLongform: e.hasAttribute('data-content-longform'),
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
