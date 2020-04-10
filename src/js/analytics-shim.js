import debugFactory from 'debug'

const debug = debugFactory('analytics')

export default class Analytics {
    constructor({ backend = GtagBackend } = {}) {
        this._backend = backend
    }

    onPageChange(params) {
        debug('PageChange: %o', params)
        this._backend.onPageChange(params)
    }

    onTimingEvent({ name, label = name, category, value = null }) {
        // By default, take time from page load
        if (value === null) {
            value = Math.round(performance.now())
        }

        const params = { name, label, category, value }
        debug('TimingEvent: %o', params)

        this._backend.onTimingEvent(params)
    }

    onError(params) {
        debug('Error: %o', params)
        this._backend.onError(params)
    }

    onFatalError(params) {
        debug('FatalError: %o', params)
        return this._backend.onFatalError(params)
    }
}

export const NoopBackend = {
    onPageChange() {},
    onTimingEvent() {},
    onError() {},
    onFatalError() {
        return Promise.resolve()
    },
}

function gtag(...args) {
    if (window.gtag) {
        window.gtag(...args)
    } else {
        // eslint-disable-next-line no-console
        console.error('gtag is not defined', args)
    }
}

/**
 * Shim to send analytics events to Google Analytics. Relies on
 * gtag being previously declared globally.
 */
export const GtagBackend = {
    onPageChange({ title, path }) {
        gtag('config', 'UA-51279886-1', {
            page_title: title,
            page_path: path,
        })
    },

    onTimingEvent({ name, label, category, value }) {
        gtag('event', 'timing_complete', {
            name: name,
            label: label,
            value: value,
            event_category: category,
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

        const callback = new Promise((_res) => {
            resolve = _res
        })

        const timeout = new Promise((res) => {
            setTimeout(() => {
                res()
            }, 300)
        })

        gtag('event', 'exception', {
            description: String(error),
            fatal: true,
            event_callback: resolve,
        })

        return Promise.race([callback, timeout])
    },
}
