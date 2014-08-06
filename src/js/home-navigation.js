'use strict';
(function initializeSectionNavigation($) {
    /* Don't try to enhance navigation if onhashchange is not supported. */
    if (!('onhashchange' in window)) return;

    var baseTitle = 'William Bain';

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        baseTitle = '[dev] ' + baseTitle;
    }

    $(document).ready(function setInitialNavSection() {
        /* If there is already a hash ID in the URL, try to get a nav link
           that matches it */
        var href,
            initialSection = getNavLinksForHash();

        /* If there was a hash ID in the URL and it had a corresponding link
           in the navbar, retitle the page appropriately */
        if (initialSection && initialSection.length > 0) {
            href = initialSection.attr('href');
            updateTitle(href);
        }
        /* Use the about section as a fallback */
        else {
            href = '#about';
            initialSection = $('nav a[href="#about"]');

            /* Return if the fallback fails */
            if (initialSection.length === 0) return;

            /* Set the URL to include the appropriate hash */
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, baseTitle+' - About',
                        window.location.href+'#about');
            }

            document.title = baseTitle + ' - About';
        }


        /* Set the selected nav link to the active color and hide the other
           sections */
        initialSection.addClass('active-link');
        $('.content').not(href).addClass('hidden');
    });

    $(window).on('hashchange', function updateOnHashChange() {
        var href,
            target,
            navs = getNavLinksForHash();

        /* If there are no nav links to the current hash id then return */
        if (!navs || navs.length === 0) return;

        /* Get the target section element */
        href = navs.attr('href');
        target = $(href);

        /* If the target was not found display all sections with no
           frills and throw an error */
        if (target.length === 0) {
            $('.active-link').removeClass('active-link');
            $('.content.hidden').removeClass('hidden').css('opacity', 1);
            throw new Error('Failed to find element '+href);
        }

        updateTitle(href);

        /* Add CSS for the active section link */
        $('.active-link').not(navs).removeClass('active-link');
        navs.addClass('active-link');

        /* Hide other content and then display the target content */
        $('.content').not('.hidden').not(target).animate(
            {opacity: 0},
            250,
            function () {
                $(this).addClass('hidden');
            }
        )
        .promise().done(function () {
            if (target.hasClass('hidden')) {
                target.css('opacity', 0);
                target.removeClass('hidden');
                target.animate(
                    {opacity: 1},
                    250
                );
            }
        });
    });

    function updateTitle(id) {
        var header = $(id+' > h2'), text = null;
        if (header.length === 1) {
            text = header.text().replace(/^\s+|\s+$/, '').replace(/\s+/, ' ');
        }
        if (text && text.length > 0) {
            document.title = baseTitle + ' - ' + text;
        }
        else {
            document.title = baseTitle;
        }
    }

    function getNavLinksForHash() {
        var hash = window.location.hash;

        if (typeof hash === 'string' && hash.length > 1) {
            return $('nav a[href="'+hash+'"]');
        }
        return null;
    }
})(jQuery);
