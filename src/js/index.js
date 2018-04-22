import '../scss/cs-homepage.scss'
import './dynamic-navigation'
import './scroll-effects'

import { LispAnimation } from './content/lisp'

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

const lispAnimation = document.getElementById('cisco-lisp-animation')

if (lispAnimation) {
    new LispAnimation({ canvas: lispAnimation })
}
