import debugFactory from 'debug'
import type { SentryClient } from './sentry-shim'

const debug = debugFactory('analytics')

export type PageChangeParams = { title: string | null; path: string }

export type EventCategory = 'dynamic nav'
export type EventParams = {
    label: string
    category: EventCategory
    value?: number
}

export type ErrorParams = {
    exception: unknown
    context: ErrorContext
    category: EventCategory
}

export type ErrorContext = {
    when?:
        | 'initialization'
        | 'transition'
        | 'transition.fetch'
        | 'transition.embeds'
        | 'transition.embeds.init'

    transitionTo?: string
    contentTrigger?: string
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
        let out: ReturnType<AnalyticsBackend[M]>[] | void = undefined
        if (gatherResults) {
            out = []
        }

        for (const backend of this._backends) {
            const fn = backend[method] as (
                this: AnalyticsBackend,
                ...a: Parameters<AnalyticsBackend[M]>
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

export class SentryBackend implements AnalyticsBackend {
    S: SentryClient

    constructor(client: SentryClient) {
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
        this.S.captureException(exception, (scope) =>
            scope.setContext('wabain:reported', context),
        )
    }

    onFatalError(params: ErrorParams): Promise<void> {
        this.S.withScope((scope) => {
            scope.setContext('wabain:reportMeta', { fatal: true })
            this.onError(params)
        })
        return Promise.resolve(this.S.close()).then(noop)
    }
}

const gtag: Gtag.Gtag = window.gtag || gtagMissing

function gtagMissing(...args: unknown[]): void {
    console.error('gtag is not defined for', ...args)
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

        gtag('config', 'G-SJQF3R12ZH', params)
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
            description: `${String(exception)} ${JSON.stringify(context)}`,
            fatal: false,
        }

        gtag('event', 'exception', params)
    },

    onFatalError({ exception, context }): Promise<void> {
        let resolve: () => void

        const callback = new Promise<void>((_res) => {
            resolve = _res
        })

        resolve = resolve!

        const timeout = new Promise<void>((res) => {
            setTimeout(() => {
                res()
            }, 300)
        })

        // prettier-ignore
        const params: Gtag.ControlParams & Gtag.EventParams = {
            'description': `${JSON.stringify(context)}: ${String(exception)}`,
            'fatal': true,
            'event_callback': resolve,
        }

        gtag('event', 'exception', params)

        return Promise.race([callback, timeout])
    },
}
