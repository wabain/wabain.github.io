import debugFactory from 'debug'
import {
    getDomainRelativeUrl,
    isHashChange,
    isRelativeHref,
    isCurrentLocation,
} from './normalize-href'
import {
    LayoutTransitionNavigationParameters as LayoutTransitionNavigation,
    transitionContent,
} from './layout-transition'

import Analytics from './analytics'
import { ContentAttributes, ContentTrigger } from './content-types'

const debug = debugFactory('dynamic-navigation')

export type DynamicNavParameters = {
    analytics: Analytics
    contentTriggers: ContentTrigger[]
}

type ResolutionCache = Record<string, Promise<{ content: string }>> &
    // eslint-disable-next-line @typescript-eslint/ban-types
    Record<keyof Object, never>

export function initializeDynamicNavigation(
    params: DynamicNavParameters,
): DynamicNavDispatcher | null {
    const { analytics } = params

    try {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new DynamicNavDispatcher(params)
    } catch (exc) {
        debug(
            'bailing from dynamic nav initialization: %s (url %s)',
            exc,
            location.href,
        )
        analytics.onError({ error: String(exc) })
        return null
    }
}

/**
 * Parse the document's title. The base title is all text up to the first "-",
 * excluding trailing whitespace. Subsequent text is the page title.
 */
function parseTitle(title: string): { base: string; page: string | null } {
    const parsed = /(.*?)(?:\s*-\s*(.*))?$/.exec(title)

    if (!parsed) {
        return { base: title, page: null }
    }

    return {
        base: parsed[1],
        page: parsed[2] || null,
    }
}

export class DynamicNavError extends Error {
    constructor(message: string) {
        super(message)
    }
}

export class DynamicNavDispatcher {
    // XXX underscore?
    private analytics: Analytics
    private pageTrans: PageTransformer

    private _cache: ResolutionCache
    private _fetchIdx: number
    private _lastHref: string

    constructor({ analytics, contentTriggers }: DynamicNavParameters) {
        this.analytics = analytics
        this._handleClick = this._handleClick.bind(this)
        this._handlePopState = this._handlePopState.bind(this)

        this._cache = Object.create(null)
        this._fetchIdx = 0

        this._lastHref = location.href

        // Only initialize dynamic navigation if HTML5 history APIs are available
        if (!window.history || !window.history.pushState) {
            throw new DynamicNavError('no support for History API')
        }

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const pageTrans = PageTransformer.forDocument(document, {
            analytics,
            contentTriggers,
        })
        if (!pageTrans) {
            throw new DynamicNavError('failed to find expected page areas')
        }

        this.pageTrans = pageTrans

        const relativeHref = getDomainRelativeUrl(location.href)
        if (!relativeHref) {
            throw new DynamicNavError(
                `initialized on unexpected domain: ${location.href}`,
            )
        }

        this._cache[relativeHref] = Promise.resolve({
            content: this.pageTrans.currentContent,
        })

        this.pageTrans.root.addEventListener('click', this._handleClick, false)
        window.addEventListener('popstate', this._handlePopState, false)

        analytics.onEvent('dynamic_nav_ready', {
            label: 'Dynamic nav ready',
            category: 'dynamic nav',
            value: Math.round(performance.now()),
        })
    }

    private _handleClick(evt: MouseEvent): void {
        const target = evt.target instanceof HTMLElement ? evt.target : null
        const currentTarget =
            evt.currentTarget instanceof HTMLElement ? evt.currentTarget : null

        const anchor = findAnchor(target, currentTarget)
        if (!anchor) {
            return
        }

        if (
            isCurrentLocation(anchor.href) ||
            isHashChange(anchor.href) ||
            !isRelativeHref(anchor.href) ||
            hasModifierKey(evt)
        )
            return

        evt.preventDefault()
        history.pushState(
            { handler: 'DynamicNavDispatcher/click' },
            '',
            anchor.href,
        )

        this._lastHref = anchor.href
        this._handleNavigation(anchor.href, { hasManagedScroll: false })
    }

    private _handlePopState(): void {
        const hashChange = isHashChange(this._lastHref)

        this._lastHref = location.href

        if (hashChange) {
            return
        }

        this._handleNavigation(location.href, { hasManagedScroll: true })
    }

    private _handleNavigation(
        href: string,
        options: LayoutTransitionNavigation,
    ): void {
        const relative = getDomainRelativeUrl(href)
        if (!relative) {
            throw new Error('unexpected navigation to ' + href)
        }

        debug('dynamic navigation triggered (href %s)', relative)
        this._loadContent(relative, options)
    }

    private _loadContent(
        href: string,
        options: LayoutTransitionNavigation,
    ): void {
        this.pageTrans.setContentPending(true)
        const { idx, promise } = this._getOrFetch(href)

        promise
            .then(({ content }) => {
                if (this._fetchIdx !== idx) {
                    debug('load %s: old fetch; bailing from load', href)
                    return
                }

                debug('load %s: updating content', href)
                this.pageTrans.receivedContent(href, content, options)
            })
            .catch((err) => {
                debug('load %s: fatal: %s', href, err)

                this.analytics
                    .onFatalError({
                        error: `failed to load ${href}: ${err}`,
                    })
                    .then(() => {
                        location.reload()
                    })
            })
    }

    private _getOrFetch(
        href: string,
    ): { idx: number; promise: Promise<{ content: string }> } {
        const idx = ++this._fetchIdx

        if (href in this._cache) {
            debug('load %s: using cached promise', href)
        } else {
            const cacheUrl =
                '/section-partial' + (href === '/' ? '/index.html' : href)
            debug('load %s: requesting partial %s', href, cacheUrl)

            this._cache[href] = fetch(cacheUrl)
                .then((res) => {
                    if (!res.ok)
                        throw new Error(
                            'network error: ' +
                                res.status +
                                ' ' +
                                res.statusText,
                        )

                    return res.text()
                })
                .then((text) => {
                    return { content: text }
                })
        }

        return { idx, promise: this._cache[href] }
    }
}

function hasModifierKey(evt: MouseEvent): boolean {
    return evt.ctrlKey || evt.metaKey || evt.shiftKey
}

class TimedCallback {
    complete: boolean
    cancelled: boolean

    _id: number

    constructor(fn: () => void, duration: number, key = '') {
        this.complete = this.cancelled = false
        this._id = setTimeout(() => {
            this.complete = true
            debug('Timer expired, %ss %s', duration, key)
            fn()
        }, duration)
    }

    cancel(): void {
        this.complete = this.cancelled = true
        clearTimeout(this._id)
    }
}

type PageTransformerParams = {
    baseTitle: string
    root: HTMLElement
    navElem: HTMLElement
    contentElem: HTMLElement
    analytics: Analytics
    contentTriggers: ContentTrigger[]
}

class PageTransformer {
    private baseTitle: string
    root: HTMLElement
    private navElem: HTMLElement
    private contentElem: HTMLElement
    private analytics: Analytics
    private contentTriggers: ContentTrigger[]
    private contentPending: boolean

    private _slow: TimedCallback | null

    constructor({
        baseTitle,
        root,
        navElem,
        contentElem,
        analytics,
        contentTriggers,
    }: PageTransformerParams) {
        this.baseTitle = baseTitle
        this.root = root
        this.navElem = navElem
        this.contentElem = contentElem
        this.analytics = analytics
        this.contentTriggers = contentTriggers

        this.contentPending = false

        this._slow = null
    }

    static forDocument(
        document: Document,
        {
            analytics,
            contentTriggers,
        }: { analytics: Analytics; contentTriggers: ContentTrigger[] },
    ): PageTransformer | null {
        const root = document.body
        const contentElem = document.querySelector(
            '[data-region-id="primary-content"]',
        )
        const navElem = document.querySelector('[data-region-id="page-header"]')

        if (
            !(
                root &&
                contentElem instanceof HTMLElement &&
                navElem instanceof HTMLElement
            )
        ) {
            return null
        }

        const { base: baseTitle, page: pageTitle } = parseTitle(document.title)
        debug(
            'initial mount, base title %s, page title %s',
            baseTitle,
            pageTitle,
        )

        return new PageTransformer({
            baseTitle,
            root,
            contentElem,
            navElem,
            analytics,
            contentTriggers,
        })
    }

    get currentContent(): string {
        return this.contentElem.innerHTML
    }

    setContentPending(value: boolean): void {
        if (value === this.contentPending) {
            return
        }

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

    private _contentPendingSlow(): void {
        // XXX: Fill this in
        debug('content load is slow, should show a spinner')
    }

    receivedContent(
        href: string,
        content: string,
        navigationOptions: LayoutTransitionNavigation,
    ): Promise<void> {
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

        this.analytics.onPageChange({
            title: newAttrs.title,
            path: href,
        })

        return transitionContent({
            container: this.contentElem,
            attributes: {
                old: oldAttrs,
                new: newAttrs,
            },
            content: frag,
            navigation: navigationOptions,
            beforeContentEnter: () => {
                this._runContentTriggers()
            },
        }).catch((err) => {
            debug('load %s: transition: fatal: %s', href, err)

            this.analytics
                .onFatalError({
                    error: `transition to ${href}: ${err}`,
                })
                .then(() => {
                    location.reload()
                })
        })
    }

    private _updateNavLinks({ active }: { active: string }): void {
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

    private _setDocTitle(title: string | null): void {
        if (title) {
            document.title = this.baseTitle + ' - ' + title
        } else {
            document.title = this.baseTitle
        }
    }

    private _runContentTriggers(): void {
        for (const trigger of this.contentTriggers) {
            try {
                trigger(this.contentElem)
            } catch (e) {
                this.analytics.onError({
                    error: `DynamicNav: content trigger ${
                        trigger ? trigger.name : 'unknown'
                    }: ${e}`,
                })
            }
        }
    }
}

function getContentAttributes(
    root: Element | DocumentFragment,
): ContentAttributes {
    if (!root.children) {
        return { title: null, isLongform: false }
    }

    const e = root.children[0]

    return {
        title: e.getAttribute('data-page-meta'),
        isLongform: e.hasAttribute('data-content-longform'),
    }
}

function findAnchor(
    elem: Element | null,
    guard: Element | null,
): HTMLAnchorElement | null {
    while (elem && elem !== guard) {
        if (elem.nodeName === 'A') {
            return elem as HTMLAnchorElement
        }

        elem = elem.parentElement
    }

    return null
}
