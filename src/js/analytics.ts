import debugFactory from 'debug'

const debug = debugFactory('analytics')

export type PageChangeParams = { title: string | null; path: string }

export type EventCategory = 'dynamic nav'
export type EventParams = {
    label: string
    category: EventCategory
    value?: number
}

export type ErrorParams = { error: string }

export default class Analytics {
    private _backend: AnalyticsBackend

    constructor(options?: { backend: AnalyticsBackend }) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const { backend = GtagBackend } = options || {}

        this._backend = backend
    }

    onPageChange(params: PageChangeParams): void {
        debug('PageChange: %o', params)
        this._backend.onPageChange(params)
    }

    onEvent(action: string, params: EventParams): void {
        debug('Event: %s %o', action, params)
        this._backend.onEvent(action, params)
    }

    onError(params: ErrorParams): void {
        debug('Error: %o', params)
        this._backend.onError(params)
    }

    onFatalError(params: ErrorParams): Promise<void> {
        debug('FatalError: %o', params)
        return this._backend.onFatalError(params)
    }
}

export interface AnalyticsBackend {
    onPageChange(params: PageChangeParams): void
    onEvent(action: string, params: EventParams): void
    onError(params: ErrorParams): void
    onFatalError(params: ErrorParams): Promise<void>
}

export const NoopBackend: AnalyticsBackend = {
    onPageChange() {
        /* stub */
    },
    onEvent() {
        /* stub */
    },
    onError() {
        /* stub */
    },
    onFatalError() {
        return Promise.resolve()
    },
}

type GtagOptional = Gtag.ControlParams | Gtag.EventParams | Gtag.CustomParams

type GtagArgs =
    | ['config', string, GtagOptional?]
    | ['set', Gtag.CustomParams]
    | ['js', Date]
    | ['event', Gtag.EventNames | string, GtagOptional?]

type WhenDefined<T, X> = undefined extends T ? never : X

const gtag: Gtag.Gtag = function gtag(...args: GtagArgs) {
    const { gtag: globalGtag } = window as { gtag?: Gtag.Gtag }

    if (globalGtag) {
        // Work around issues with sum types and the spread operator
        type GtagFn = (...args: GtagArgs) => void
        ;(globalGtag as WhenDefined<typeof globalGtag, GtagFn>)(...args)
    } else {
        console.error('gtag is not defined for', ...args)
    }
}

/**
 * Shim to send analytics events to Google Analytics. Relies on
 * gtag being previously declared globally.
 */
export const GtagBackend: AnalyticsBackend = {
    onPageChange({ title, path }) {
        // prettier-ignore
        const params = {
            'page_title': title,
            'page_path': path,
        }

        gtag('config', 'UA-51279886-1', params)
    },

    onEvent(action, { label, category, value }) {
        // prettier-ignore
        const params: Gtag.EventParams = {
            'value': value,
            'event_category': category,
            'event_label': label,
        }

        gtag('event', action, params)
    },

    onError({ error }) {
        const params: Gtag.EventParams = {
            description: String(error),
            fatal: false,
        }

        gtag('event', 'exception', params)
    },

    onFatalError({ error }) {
        let resolve: () => void

        const callback = new Promise<void>((_res) => {
            resolve = _res
        })

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resolve = resolve!

        const timeout = new Promise<void>((res) => {
            setTimeout(() => {
                res()
            }, 300)
        })

        // prettier-ignore
        const params: Gtag.ControlParams & Gtag.EventParams = {
            'description': String(error),
            'fatal': true,
            'event_callback': resolve,
        }

        gtag('event', 'exception', params)

        return Promise.race([callback, timeout])
    },
}
