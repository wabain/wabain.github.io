import debugFactory from 'debug'
import type Analytics from '../analytics'

const debug = debugFactory('embeds:media')

/**
 * Video elements only autoplay if present on initial page load; cause videos
 * to autoplay after dynamic navigation as well.
 */
export default function initializeMediaEmbeds(
    content: HTMLElement,
    analytics: Analytics,
): void {
    for (const elem of content.querySelectorAll('video[autoplay]')) {
        // Without playsinline the video may hijack the screen on iOS. Require
        // playsinline unconditionally instead of trying to detect the OS.
        if (!elem.hasAttribute('playsinline')) {
            debug('skipping element: no playsinline attribute', elem)
            continue
        }

        Promise.resolve(elem)
            .then((elem) => {
                if (!(elem instanceof HTMLVideoElement)) {
                    throw new TypeError(
                        `expected video element, got ${String(elem)}`,
                    )
                }

                return elem.play()
            })
            .catch((err) => {
                analytics.onError({
                    exception: err,
                    context: {
                        when: 'transition.embeds',
                        contentTrigger: 'media',
                    },
                    category: 'dynamic nav',
                })
            })
    }
}
