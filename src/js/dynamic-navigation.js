(function ($) {
  'use strict';
  var baseTitle, $contentElem, cache, currentHref, loadingIndicator;

  // Only initialize dynamic navigation if HTML5 history APIs are available
  if (window.history && window.history.pushState) {
    $contentElem = getContentElem();

    if ($contentElem) {
      // The base title is all text up to the final "-", excluding trailing whitespace
      baseTitle = (/(.*?)(?:\s*-[^-]*)?$/).exec(document.title)[1];

      // Initialize the content cache
      cache = {};

      // Initialize the navigation bindings
      initializeNavigation();
    }
  }

  function initializeNavigation() {
    // Cache the active content of the page, if available
    var active = $('nav a.active-link');
    if (active) {
      currentHref = getNormalizedHref(active);

      if (currentHref) {
        cache[currentHref] = $contentElem.html();
      }
    }

    // Bind local links in the header
    $('.header-block a[href]').filter(function () {
      return isRelativeHref($(this).attr('href'));
    }).on('click', doDynamicNavigation);
  }

  function doDynamicNavigation(e) {
    var $elem = $(e.currentTarget),
        href = getNormalizedHref($elem),
        navLink,
        specificTitle,
        cached,
        hasNewContent,
        displayedNewContent;

    // Special-case the handling of index.html
    if (href === '.')
      href = 'index.html';

    // If the current href is the same as the one which was clicked, return
    // and let the page reload. The rationale is that if the user is continuing
    // to click, then the page probably hasn't been responding as desired.
    if (currentHref === href)
      return;

    currentHref = href;

    // If the href is null (perhaps because it was absolute) then return
    // and let the default occur.
    if (!href)
      return;

    // Stop the page from reloading
    e.preventDefault();

    // If the content for this page is already cached, then take the cached value.
    // Otherwise, make a request for it.
    cached = cache.hasOwnProperty(href);
    if (cached) {
      hasNewContent = [cache[href], 'success', null];
    } else {
      hasNewContent = $.get('section-partial/'+href);
    }

    // Fade out the content
    $contentElem.addClass('fading faded-out');

    // Update the links in the navbar
    navLink = $('nav a[href="'+href+'"]');
    $('nav a[href]').not(navLink).removeClass('active-link');
    if (navLink.length > 0) {
      navLink.addClass('active-link');
    } else {
      navLink = null;
    }

    // Update the URL and document title
    window.history.pushState(null, document.title, href);

    specificTitle = (navLink || $elem).attr('data-pagetitle') || (navLink || $elem).text();
    document.title = baseTitle + ' - ' + specificTitle;

    // Wait for at least 500ms and for the new content to load
    displayedNewContent = $.when(hasNewContent, waitFor(500));

    // If loading takes at least 750ms then show a loading indicator
    waitFor(750).then(function () {
      if (loadingIndicator || displayedNewContent.state() !== 'pending')
        return;

      $contentElem.addClass('hidden');

      loadingIndicator = $('<img src="home-assets/img/ajax-loading.gif" class="loading-indicator">');
      $('body').append(loadingIndicator);
    });

    displayedNewContent.done(function (ajaxData) {
      var newContent = ajaxData[0];

      // Cache the content
      if (!cached)
        cache[href] = newContent;

      // If the href has changed in the mean time then don't display the new content
      if (currentHref !== href)
        return;

      // Load the content on the page
      $contentElem.html(newContent);

      // Remove the loading indicator if one was there
      if (loadingIndicator) {
        loadingIndicator.remove();
        loadingIndicator = null;
      }

      // Fade in the content element
      $contentElem.removeClass('faded-out hidden');

      waitFor(500).then(function () {
        $contentElem.removeClass('fading');
      });
    })
    .fail(function () {
      // On failure just go to the referenced location
      window.location = href;
    });
  }

  function getContentElem() {
    var $contentElem = $('section.content');
    if ($contentElem.length === 0) return null;
    if ($contentElem.length > 1) return $contentElem.first();
    return $contentElem;
  }

  function getNormalizedHref($elem) {
    var href = $elem.attr('href');

    if (!isRelativeHref(href))
      return null;

    // Strip whitespace
    return href.replace(/^\s+|\s+$/g, '');
  }

  function waitFor(ms) {
    var q = new $.Deferred();
    setTimeout(function () {q.resolve();}, ms);
    return q;
  }

  function isRelativeHref(path) {
    if (path == null) return false;
    if (path === '') return true;
    return (/^\s*([^:/\s]|\.)+(\/|\s*$)/).test(path);
  }
})(jQuery);
