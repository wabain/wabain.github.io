/* cs-homepage v0.1.0, 2014-05-20
   Copyright (c) 2014 William Bain */
'use strict';
(function ($) {
    /* Don't try to enhance navigation if onhashchange is not supported. */
    if (window.onhashchange === undefined) return;

    $(document).ready(function () {
        /* If there is already a hash id in the URL, try to get a nav link
           that matches it */
        var initialSection = getHashNavLinks();

        /* Use the about section as a fallback */
        if (!initialSection || initialSection.length === 0) {
            initialSection = $('nav a[href="#about"]');
        }

        /* Set the nav link to the active color and hide the other sections */
        initialSection.addClass('active-link');
        $('.content').not(initialSection.attr('href')).addClass('hidden');
    });

    $(window).on('hashchange', function () {
        var navs = getHashNavLinks();
        var target;

        /* If there are no nav links to the current hash id then return */
        if (!navs || navs.length === 0) return;

        /* Get the target section element */
        target = $(navs.attr('href'));

        /* If the target was not found display all sections with no
           frills and throw an error */
        if (target.length === 0) {
            $('.active-link').removeClass('active-link');
            $('.content.hidden').removeClass('hidden').css('opacity', 1);
            throw new Error('Failed to find element '+navs.attr('href'));
        }

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

    function getHashNavLinks() {
        var hash = window.location.hash;

        if (typeof hash === 'string' && hash.length > 1) {
            return $('nav a[href="'+hash+'"]');
        }
        return null;
    }
})(jQuery);
