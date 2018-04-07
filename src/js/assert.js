export function assert(cond, msg) {
    if (cond) {
        return
    }

    var args = []
    var argCount = arguments.length
    for (var i=2; i < argCount; i++) {
        args.push(arguments[i])
    }

    var formattedMsg = 'Assert: ' + format(msg, args)
    throw new Error(formattedMsg)
}

export function assertWarning(cond, msg) {
    if (cond) {
        return cond
    }

    var args = []
    var argCount = arguments.length
    for (var i=2; i < argCount; i++) {
        args.push(arguments[i])
    }

    var formattedMsg = 'Assert: ' + format(msg, args)

    console.error(formattedMsg) // eslint-disable-line no-console
    return cond
}

var registeredNotifiers = []

export function registerErrorNotifier() {
    // ...
}

export function notifyError(ctx, err) {

}

/*
 * Adapted from 'debug'
 *
 * (The MIT License)
 *
 * Copyright (c) 2014 TJ Holowaychuk <tj@vision-media.ca>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the 'Software'), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

function format(msg, args) {
    var index = 0
    msg = msg || ''
    msg = msg.replace(/%([a-zA-Z%])/g, function(match, format) {
        // if we encounter an escaped % then don't increase the array index
        if (match === '%%') return match
        var formatter = formatters[format]
        if ('function' === typeof formatter) {
            var val = args[index]
            match = formatter(val)
        }
        index++
        return match
    })

    var argCount = args.length
    while (index < argCount) {
        msg += ' ' + String(args[index])
        index++
    }

    return msg
}

var formatters = {
    s: String
}