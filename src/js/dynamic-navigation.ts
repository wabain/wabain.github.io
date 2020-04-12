import debugFactory from 'debug'
import {
    getDomainRelativeUrl,
    isHashChange,
    isRelativeHref,
    isCurrentLocation,
} from './normalize-href'
import { transitionContent } from './layout-transition'

import Analytics from './analytics'
import { ContentAttributes, ContentTrigger } from './content-types'

const debug = debugFactory('dynamic-navigation')

export type DynamicNavParameters = {
    analytics: Analytics
    contentTriggers: ContentTrigger[]
}

type NavigationTrigger =
    | { type: 'popstate'; event: PopStateEvent }
    | {
          type: 'click'
          event: MouseEvent
          anchor: HTMLAnchorElement
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
    private analytics: Analytics
    private pageTrans: PageTransformer
    private loader: ContentLoader

    private _lastHref: string

    constructor({ analytics, contentTriggers }: DynamicNavParameters) {
        this.analytics = analytics

        this._handleClick = this._handleClick.bind(this)
        this._handlePopState = this._handlePopState.bind(this)

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

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        this.loader = new ContentLoader({
            analytics,
            initialContent: pageTrans.currentContent,
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
        this._handleNavigation(anchor.href, {
            type: 'click',
            event: evt,
            anchor,
        })
    }

    private _handlePopState(event: PopStateEvent): void {
        const hashChange = isHashChange(this._lastHref)

        this._lastHref = location.href

        if (hashChange) {
            return
        }

        this._handleNavigation(location.href, { type: 'popstate', event })
    }

    private _handleNavigation(href: string, trigger: NavigationTrigger): void {
        const relative = getDomainRelativeUrl(href)
        if (!relative) {
            throw new Error('unexpected navigation to ' + href)
        }

        debug(
            'dynamic navigation triggered (%s, href %s)',
            trigger.type,
            relative,
        )
        const promise = this.loader.load(relative)
        this.pageTrans.setContentPending(relative, promise, trigger)
    }
}

function hasModifierKey(evt: MouseEvent): boolean {
    return evt.ctrlKey || evt.metaKey || evt.shiftKey
}

class ContentLoader {
    private analytics: Analytics

    private _cache: ResolutionCache

    constructor({
        analytics,
        initialContent,
    }: {
        analytics: Analytics
        initialContent: string
    }) {
        this.analytics = analytics
        this._cache = Object.create(null)

        const relativeHref = getDomainRelativeUrl(location.href)
        if (!relativeHref) {
            throw new DynamicNavError(
                `initialized on unexpected domain: ${location.href}`,
            )
        }

        this._cache[relativeHref] = Promise.resolve({ content: initialContent })
    }

    load(href: string): Promise<{ content: string }> {
        const cached = this._cache[href]

        if (cached) {
            debug('load %s: using cached promise', href)
            return cached
        }

        return this._fetch(href).then(
            ({ content }) => {
                debug('load %s: received parsed content', href)
                return { content }
            },
            (err) => {
                debug('load %s: fatal: %s', href, err)

                return this.analytics
                    .onFatalError({
                        error: `failed to load ${href}: ${err}`,
                    })
                    .then<never>(() => {
                        location.reload()
                        throw new DynamicNavError('unreachable (post reload)')
                    })
            },
        )
    }

    private _fetch(href: string): Promise<{ content: string }> {
        const cacheUrl =
            '/section-partial' + (href === '/' ? '/index.html' : href)

        debug('load %s: requesting partial %s', href, cacheUrl)

        const promise = (this._cache[href] = fetch(cacheUrl)
            .then((res) => {
                if (!res.ok)
                    throw new Error(
                        'network error: ' + res.status + ' ' + res.statusText,
                    )

                return res.text()
            })
            .then((text) => {
                return { content: text }
            }))

        return promise
    }
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

    private _fetchIdx: number
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

        this._fetchIdx = 0
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

    setContentPending(
        href: string,
        promise: Promise<{ content: string }>,
        trigger: NavigationTrigger,
    ): void {
        this._clearIdlePending()

        this._slow = new TimedCallback(() => {
            this._contentPendingSlow()
        }, 750)

        const idx = ++this._fetchIdx

        promise.then(({ content }) => {
            if (this._fetchIdx !== idx) {
                debug('page transform %s: old fetch; bailing from load', href)
                return
            }

            this._receivedContent(href, content, trigger)
        })
    }

    /*
     * Clear state associated with pending content which is in the process of
     * being transitioned into view.
     */
    private _clearIdlePending(): void {
        if (this._slow) {
            this._slow.cancel()
            this._slow = null
        }
    }

    private _contentPendingSlow(): void {
        // XXX: Fill this in
        debug('content load is slow, should show a spinner')
    }

    private _receivedContent(
        href: string,
        content: string,
        trigger: NavigationTrigger,
    ): Promise<void> {
        this._clearIdlePending()

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
            navigation: {
                hasManagedScroll: triggerManagesScroll(trigger.type),
            },
            beforeContentEnter: () => {
                this._runContentTriggers()
            },
        }).catch((err) => {
            debug('load %s: transition: fatal: %s', href, err)

            return this.analytics
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

function triggerManagesScroll(triggerType: NavigationTrigger['type']): boolean {
    switch (triggerType) {
        case 'click':
            return false

        case 'popstate':
            return true

        default:
            unreachable(triggerType)
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

function unreachable(value: never): never {
    throw new Error(`unreachable: ${typeof value} ${String(value)}`)
}
