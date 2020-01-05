/**
 * Video elements only autoplay if present on initial page load; cause videos
 * to autoplay after dynamic navigation as well.
 */
export default function initializeMediaEmbeds(content) {
    for (const elem of content.querySelectorAll('video[autoplay]')) {
        elem.play()
    }
}
