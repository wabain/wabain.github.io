/* cs-homepage v0.1.6, 2014-11-27
   Copyright (c) 2014 William Bain */
(function ($) {
  'use strict';
  var baseTitle, $contentElem, cache, currentHref, loadingIndicator;

  if (window.history && window.history.pushState) {
    $contentElem = getContentElem();

    if ($contentElem) {
      baseTitle = (/(.*?)(?:\s*-[^-]*)?$/).exec(document.title)[1];
      cache = {};

      initializeNavigation();
    }
  }

  function initializeNavigation() {
    var active;

    active = $('nav a.active-link');
    if (active) {
      currentHref = getNormalizedHref(active);
      if (currentHref) cache[currentHref] = $contentElem.html();
    }

    $('.header-block a[href]').each(function (index, elem) {
      var $elem = $(elem);
      if (isRelative($elem.attr('href'))) {
        $elem.on('click', doDynamicNavigation);
      }
    });
  }

  function doDynamicNavigation(e) {
    var $elem = $(e.currentTarget),
        href = getNormalizedHref($elem),
        navLink,
        cached,
        hasNewContent,
        displayedNewContent;

    if (currentHref === href) return;

    currentHref = href;
    if (!$contentElem || !href) return;

    e.preventDefault();

    cached = cache.hasOwnProperty(href);
    if (cached) {
      hasNewContent = [cache[href], 'success', null];
    } else {
      hasNewContent = $.get('section-partial/'+href);
    }

    $contentElem.addClass('fading');
    $contentElem.addClass('faded-out');

    navLink = $('nav a[href="'+href+'"]');
    $('nav a[href]').not(navLink).removeClass('active-link');
    if (navLink.length > 0) {
      navLink.addClass('active-link');
    } else {
      navLink = null;
    }
    window.history.pushState(null, document.title, href);
    document.title = baseTitle + ' - ' + (navLink || $elem).text();

    displayedNewContent = $.when(hasNewContent, waitFor(500));

    waitFor(750).then(function () {
      if (loadingIndicator || displayedNewContent.state() !== 'pending') return;

      $contentElem.addClass('hidden');

      loadingIndicator = $('<img src="home-assets/img/ajax-loading.gif" class="loading-indicator">');
      $('body').append(loadingIndicator);
    });

    displayedNewContent.done(function (ajaxData) {
      var newContent = ajaxData[0];

      if (!cached) cache[href] = newContent;

      if (currentHref !== href) return;

      $contentElem.html(newContent);

      if (loadingIndicator) {
        loadingIndicator.remove();
        loadingIndicator = null;
      }

      $contentElem.removeClass('faded-out hidden');
      waitFor(500).then(function () {
        $contentElem.removeClass('fading');
      });
    })
    .fail(function () {
      window.location = href;
    });
  }

  function getContentElem() {
    var $contentElem = $('section.content');
    if ($contentElem.length === 0) return null;
    if ($contentElem.length > 1) return $($contentElem[0]);
    return $contentElem;
  }

  function getNormalizedHref($elem) {
    var href = $elem.attr('href');
    if (!isRelative(href)) return;
    return href.replace(/^\s+|\s+$/g, '');
  }

  function waitFor(ms) {
    var q = new $.Deferred();
    setTimeout(function () {q.resolve();}, ms);
    return q;
  }

  function isRelative(path) {
    if (!path || path.length === 0) return false;
    return (/^\s*[^:/\s]+(\/|\s*$)/).test(path);
  }
})(jQuery);
