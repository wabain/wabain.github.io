import debugFactory from 'debug'

const debug = debugFactory('analytics')

export type PageChangeParams = { title: string | null; path: string }

export type TimingEventParams = {
    name: string
    label?: string
    category: string
    value?: number | null
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

    onTimingEvent({
        name,
        label = name,
        category,
        value = null,
    }: TimingEventParams): void {
        // By default, take time from page load
        if (value === null) {
            value = Math.round(performance.now())
        }

        const params = { name, label, category, value }
        debug('TimingEvent: %o', params)

        this._backend.onTimingEvent(params)
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
    onTimingEvent(params: TimingEventParams): void
    onError(params: ErrorParams): void
    onFatalError(params: ErrorParams): Promise<void>
}

export const NoopBackend: AnalyticsBackend = {
    onPageChange() {
        /* stub */
    },
    onTimingEvent() {
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
        gtag('config', 'UA-51279886-1', {
            'page_title': title,
            'page_path': path,
        })
    },

    onTimingEvent({ name, label, category, value }) {
        // prettier-ignore
        gtag('event', 'timing_complete', {
            'name': name,
            'label': label,
            'value': value,
            'event_category': category,
        })
    },

    onError({ error }) {
        gtag('event', 'exception', {
            description: String(error),
            fatal: false,
        })
    },

    onFatalError({ error }) {
        let resolve

        const callback = new Promise<void>((_res) => {
            resolve = _res
        })

        const timeout = new Promise<void>((res) => {
            setTimeout(() => {
                res()
            }, 300)
        })

        // prettier-ignore
        gtag('event', 'exception', {
            'description': String(error),
            'fatal': true,
            'event_callback': resolve,
        })

        return Promise.race([callback, timeout])
    },
}
