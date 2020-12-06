import debugFactory from 'debug'

const debug = debugFactory('analytics')

export type PageChangeParams = { title: string | null; path: string }

export type EventCategory = 'dynamic nav'
export type EventParams = {
    label: string
    category: EventCategory
    value?: number
}

export type ErrorParams = {
    exception: Error
    context: string
    category: EventCategory
}

type IfVoid<T, V, U> = void extends T ? V : U
type VoidOrArray<T> = IfVoid<T, void, T[]>

export default class Analytics {
    private _backends: AnalyticsBackend[]

    constructor({ backends }: { backends: AnalyticsBackend[] }) {
        this._backends = backends
    }

    onPageChange(params: PageChangeParams): void {
        debug('PageChange: %o', params)
        this.dispatch('onPageChange', false, params)
    }

    onEvent(action: string, params: EventParams): void {
        debug('Event: %s %o', action, params)
        this.dispatch('onEvent', false, action, params)
    }

    onError(params: ErrorParams): void {
        debug('Error: %o', params)
        this.dispatch('onError', false, params)
    }

    onFatalError(params: ErrorParams): Promise<void> {
        debug('FatalError: %o', params)
        const results = this.dispatch('onFatalError', true, params)
        return Promise.all(results).then(noop)
    }

    private dispatch<M extends keyof AnalyticsBackend>(
        method: M,
        gatherResults: IfVoid<ReturnType<AnalyticsBackend[M]>, false, true>,
        ...args: Parameters<AnalyticsBackend[M]>
    ): VoidOrArray<ReturnType<AnalyticsBackend[M]>> {
        let out: ReturnType<AnalyticsBackend[M]>[] | void
        if (gatherResults) {
            out = []
        }

        for (const backend of this._backends) {
            const fn = backend[method] as (
                ...a: typeof args
            ) => ReturnType<AnalyticsBackend[M]>

            try {
                const res = fn.apply(backend, args)

                if (out) {
                    out.push(res)
                }
            } catch (e) {
                // Could re-enter and try to handle this error, but it's
                // unlikely anything in here throws and that we can subsequently
                // recover
                debug('analytics dispatch failed: %o', e)
            }
        }

        return out as VoidOrArray<ReturnType<AnalyticsBackend[M]>>
    }
}

function noop(): void {
    /* noop */
}

export interface AnalyticsBackend {
    onPageChange(params: PageChangeParams): void
    onEvent(action: string, params: EventParams): void
    onError(params: ErrorParams): void
    onFatalError(params: ErrorParams): Promise<void>
}

type Sentry = typeof import('@sentry/browser')

export class SentryBackend implements AnalyticsBackend {
    S: Sentry

    constructor(client: Sentry) {
        this.S = client
    }

    onPageChange(): void {
        // no-op
    }

    onEvent(action: string, { category, label, value }: EventParams): void {
        this.S.addBreadcrumb({
            category,
            message: label,
            data: {
                action,
                value,
            },
        })
    }

    onError({ exception, context }: ErrorParams): void {
        this.S.withScope((scope) => {
            scope.setContext('reported', { context })
            this.S.captureException(exception)
        })
    }

    onFatalError(params: ErrorParams): Promise<void> {
        this.onError(params)
        return Promise.resolve(this.S.close()).then(noop)
    }
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

    onError({ exception, context }) {
        const params: Gtag.EventParams = {
            description: `${context}: ${String(exception)}`,
            fatal: false,
        }

        gtag('event', 'exception', params)
    },

    onFatalError({ exception, context }) {
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
            'description': `${context}: ${String(exception)}`,
            'fatal': true,
            'event_callback': resolve,
        }

        gtag('event', 'exception', params)

        return Promise.race([callback, timeout])
    },
}
