import debugFactory from 'debug'

const debug = debugFactory('embeds:media')

/**
 * Video elements only autoplay if present on initial page load; cause videos
 * to autoplay after dynamic navigation as well.
 */
export default function initializeMediaEmbeds(content: HTMLElement): void {
    for (const elem of content.querySelectorAll<HTMLVideoElement>(
        'video[autoplay]',
    )) {
        // Without playsinline the video may hijack the screen on iOS. Require
        // playsinline unconditionally instead of trying to detect the OS.
        if (!elem.hasAttribute('playsinline')) {
            debug('skipping element: no playsinline attribute', elem)
            continue
        }

        elem.play().catch((err) => {
            debug('autoplay failed:', err)
        })
    }
}
