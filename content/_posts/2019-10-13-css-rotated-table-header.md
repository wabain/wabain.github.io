---
title: "CSS Trivia: Rotated table headers in 2019"
tags: [css, trivia, web-design, best-practices]
---

Recently I built an HTML report to aggregate the results of some automated jobs. The table headings being much longer than the table's contents, I wanted to set the headings at a 45° angle. When I Googled for how to do this with CSS, the answers I got were all years old and involved some complications that seem to have become unnecessary. Since I didn't find a current guide, I wanted to record what I settled on.

The top Google result for "css rotate table header 45 degrees" is a 2014 [CSS Tricks article](https://css-tricks.com/rotated-table-column-headers/){: target="_blank" :} which rather breezily describes a variation on an earlier technique from another blog post.[^1] The trail of posts traces back to one [from 2009](http://itpastorn.blogspot.com/2009/05/rotating-column-headers-using-css-only.html){: target="_blank" :}, a very different era in web development. At the time, the best technique was to rotate the header with its top left corner staying fixed, and then to apply what the CSS Tricks article calls "some math stuff using `tan()` and `cos()`" to figure out what translation needed to be applied in order for the bottom right of the rotated header to meet the top right-hand corner of the cell below.[^2]

[^1]: CSS Tricks is an excellent resource; the post I stumbled on is the result of having a deep back catalog. As I was preparing this post I used posts from the same author to refresh my memory on how to animate SVG.

[^2]: The older posts also skew the shape of the header in order to have its horizontal lines stay parallel with the horizontal lines of the body rows. This is less relevant now that tables with external borders are largely out of style.

The key to the updated approach is that instead of rotating from the top left and then correcting the horizontal and vertical positioning, we can keep the *bottom* left point of the header fixed by setting `transform-origin`. Then we only need to offset the horizontal position of the text by the width of the table column, a constant we'll already have in our CSS.

<style>
    /*
     * Common
     */
    .tablerot {
        display: flex;
        justify-content: space-around;
        flex-wrap: wrap;
    }

    .tablerot figcaption {
        text-align: center;
    }

    .tablerot-cell {
        overflow: visible;
    }

    .tablerot-cell-outline {
        fill: white;
        stroke: #ccc;
        stroke-dasharray: 80, 60, 20;
    }
    .tablerot-cell-head .tablerot-cell-outline {
        stroke-dasharray: none;
    }

    .tablerot-cell-placeholder {
        fill: #aaa;
        stroke: none;
    }
    .tablerot-cell-head .tablerot-cell-placeholder {
        fill: #555;
    }

    /*
     * 2009
     */
    .tablerot-old .tablerot-group-head {
        animation: tablerot-old-group-head 3s ease-in-out infinite;
    }
    @keyframes tablerot-old-group-head {
        0%, 45% { transform: translate(0, 0) }
        55%, 60% {
            transform: translate(0, 5.85786437627px);
            animation-timing-function: ease-in;
        }
        70% { transform: translate(50px, 5.85786437627px) }
        75% { transform: translate(42px, 5.85786437627px) }
        80% { transform: translate(47px, 5.85786437627px) }
        85%, 100% { transform: translate(45.8578643763px, 5.85786437627px) }
    }

    .tablerot-old use[href="#tablerot-table-head"] {
        animation: tablerot-old-head 3s ease-in infinite;
        transform-origin: 20px 30px;  /* here origin is relative to svg */
    }
    @keyframes tablerot-old-head {
        0% { transform: rotate(0) }
        25%, 100% { transform: rotate(-45deg) }
    }

    .tablerot-trig {
        animation: tablerot-trig 3s ease-in infinite;
        stroke: #E53E3E;
        stroke-dasharray: 50;
        stroke-dashoffset: 50;
        fill: none;
    }
    @keyframes tablerot-trig {
        0%, 25% { stroke-dashoffset: 50; }
        40% { stroke-dashoffset: 0; opacity: 1; }
        55%, 100% { opacity: 0; }
    }

    /*
     * 2019
     */
    .tablerot-new use[href="#tablerot-table-head"] {
        animation: tablerot-new-head 3s ease-in-out infinite;
        transform-origin: 20px 50px;  /* here origin is relative to svg */
    }
    @keyframes tablerot-new-head {
        0% { transform: rotate(0); animation-timing-function: ease-in; }
        25%, 30% { transform: rotate(-45deg);  animation-timing-function: ease-in; }
        40% { transform: translateX(65px) rotate(-45deg); }
        45% { transform: translateX(58px) rotate(-45deg); }
        50% { transform: translateX(61px) rotate(-45deg); }
        55%, 100% { transform: translateX(60px) rotate(-45deg); }
    }
</style>

<svg class="hidden">
  <defs>
    <symbol id="tablerot-table-head">
      <svg class="tablerot-cell tablerot-cell-head" x="20" y="30">
        <rect class="tablerot-cell-outline" width="60" height="20" />
        <rect class="tablerot-cell-placeholder" x="5" y="6" width="42" height="8" />
      </svg>
    </symbol>
    <symbol id="tablerot-table-body">
      <svg class="tablerot-cell" x="20" y="50">
        <rect class="tablerot-cell-outline" x="0" y="0" width="60" height="20" />
        <rect class="tablerot-cell-placeholder" x="15" y="6" width="39" height="8" />
      </svg>
      <svg class="tablerot-cell" x="20" y="70">
        <rect class="tablerot-cell-outline" x="0" y="0" width="60" height="20" />
        <rect class="tablerot-cell-placeholder" x="12" y="6" width="42" height="8" />
      </svg>
      <svg class="tablerot-cell" x="20" y="90">
        <rect class="tablerot-cell-outline" x="0" y="0" width="60" height="20" />
        <rect class="tablerot-cell-placeholder" x="18" y="6" width="36" height="8" />
      </svg>
      <svg class="tablerot-cell" x="20" y="110">
        <rect class="tablerot-cell-outline" x="0" y="0" width="60" height="20" />
        <rect class="tablerot-cell-placeholder" x="16" y="6" width="38" height="8" />
      </svg>
      <svg class="tablerot-cell" x="20" y="130">
        <rect class="tablerot-cell-outline" x="0" y="0" width="60" height="20" />
        <rect class="tablerot-cell-placeholder" x="12" y="6" width="42" height="8" />
      </svg>
    </symbol>
  </defs>
</svg>

<div class="tablerot">
  <figure class="tablerot-old">
    <svg width="150" height="150" viewBox="-30 -20 160 160" xmlns="http://www.w3.org/2000/svg">
      <g class="tablerot-group-head">
        <path class="tablerot-trig" d="M 25,30 A 5 5 0 0 1 20 35 L 20,30 v 14.1421356237 h 14.1421356237" />
        <use href="#tablerot-table-head" />
      </g>
      <use href="#tablerot-table-body" />
    </svg>
    <figcaption>2009</figcaption>
  </figure>
  <figure class="tablerot-new">
    <svg width="150" height="150" viewBox="-30 -20 160 160" xmlns="http://www.w3.org/2000/svg">
      <use href="#tablerot-table-head" />
      <use href="#tablerot-table-body" />
    </svg>
    <figcaption>2019</figcaption>
  </figure>
</div>

This neatly takes care of the core problem of positioning the headings, although we'll still hit some awkwardness related to having transformed elements in the CSS layout. The example below demonstrates the technique:

{% demoembed %}
```html
<style>
  .scrollable {
    overflow: auto;
  }

  .rotated-header th {
    height: 240px;
    vertical-align: bottom;
    text-align: left;
    line-height: 1;
  }

  .rotated-header-container {
    width: 75px;
  }

  .rotated-header-content {
    width: 300px;
    transform-origin: bottom left;
    transform: translateX(75px) rotate(-45deg);
  }

  .rotated-header td:not(:first-child) {
    text-align: right;
  }
</style>

<figure class="scrollable">
  <table class="rotated-header">
    <thead>
      <tr>
        <th>Year</th>
        <th>
          <div class="rotated-header-container">
            <div class="rotated-header-content">Splines reticulated</div>
          </div>
        </th>
        <th>
          <div class="rotated-header-container">
            <div class="rotated-header-content">Ipsums loremmed</div>
          </div>
        </th>
        <th>
          <div class="rotated-header-container">
            <div class="rotated-header-content">
              Observations on the theory and practice of landscape gardening
            </div>
          </div>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>2016</td> <td>120</td> <td>1,900</td> <td>25</td>
      </tr>
      <tr>
        <td>2017</td> <td>3,002</td> <td>14,000</td> <td>16</td>
      </tr>
      <tr>
        <td>2018</td> <td>20,124</td> <td>980</td> <td>48</td>
      </tr>
    </tbody>
  </table>
</figure>
```
{% enddemoembed %}

There are a few points worth noting:

* In this demo I'm using two `divs` inside each `th`: a wrapper to set the width of the header cell and an inner div for the rotated text. In theory I think it should be possible to fix the dimensions of the cell by styling the `th` itself, but I haven't dug into the specifics of CSS table layout rules to figure out how to make it work.

* I rely on a `vertical-align` rule to push the header text to the bottom of the fixed-size `th` elements. Something similar can also be done with flexbox.

* I've set the hardcoded height of the header heuristically; in principle one could do "math stuff" to get the minimum height that includes the rotated header but in this demo the height of the rotated header is determined by the height of multiple lines of text; getting the necessary parameters dynamically is probably possible on the client side, but requires knowing exactly how the header text will be laid out. This is tricky, particularly if the font size or leading change responsively based on the window size.

* Part of the rotated headers extend outside the area of the table itself. In this demo I've wrapped the table in a scrollable container and made it left-aligned. While the scrollable area of the container includes the protruding headers, if the table is centered within the scrollable container it will be centered according to its own size, excluding the headers. This can push the headers outside the area which is visible without scrolling.

## Bonus: Fallbacks

Support for CSS transforms is pretty robust, but what happens if a user agent lacks it? In my case, the problem child was the Outlook web client, which allows embedded CSS in emails, but strips transform styles for what I imagine are security reasons. Without my making special provisions, this resulted in the unrotated row headers overlapping and becoming unreadable.

Fortunately, there's a simple fix: wrap all of the rules related to header rotation in a `@supports(transform: ...)` query. Clients not supporting the transform will render an unwieldy but basically readable table. With support for `@supports` being [a bit spottier](https://caniuse.com/#feat=css-featurequeries){: target="_blank" rel="noopener" :} than support for the CSS transforms themselves, this probably results in some extra user agents rendering the fallback, but for me that's an acceptable cost for what is basically a progressive enhancement.
