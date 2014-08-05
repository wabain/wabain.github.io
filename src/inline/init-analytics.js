/* jshint asi: true, expr: true */
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

/* *hopefully* this will let it play nice with other cookies */
ga('create', 'UA-51279886-1', {
    cookieName: '_ga51279886',
    cookieDomain: '<%= cookieDomain %>',
    cookiePath: '<%= cookiePath %>'
});
ga('send', 'pageview');

/* Track nav clicks */
$('nav a').on('click', function () {
    ga('send', 'event', {
        eventCategory: 'nav href',
        eventAction: 'click',
        eventLabel: $(this).attr('href') || '(null)'
    });
});
