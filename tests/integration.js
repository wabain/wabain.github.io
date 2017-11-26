// /*
//  * Some integration-style tests of the navigation code
//  */

// import expect from 'expect'
// import install from '../src/js/dynamic-navigation'

// const pagesOfInterest = [
//     '/index.html',
//     '/projects.html',
// ]

// for (const page of pagesOfInterest) {
//     testNavigation(page)
// }

// function testNavigation(href) {
//     describe(`test navigation: ${href}`, () => {
//         let mountedPage = null

//         before(done => {
//             const url = '/section-partial' + href
//             fetch(url)
//                 .then(resp => {
//                     if (!resp.ok) {
//                         throw new Error(`Failed to access ${url}: ${resp.statusText}`)
//                     }

//                     return resp.text()
//                 })
//                 .then(html => {
//                     console.log(html)
//                     mountedPage = document.createElement('div')
//                     mountedPage.innerHTML = html
//                     done()
//                 })
//                 .catch(done)
//         })

//         it('should really work', () => {

//         })

//         after(() => {
//             if (mountedPage && mountedPage.parentElement) {
//                 mountedPage.parentElement.removeChild(mountedPage)
//                 mountedPage = null
//             }
//         })
//     })
// }
