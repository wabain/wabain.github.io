var INSTANCE_STATE_ENTER = 'inst:state:enter'
var INSTANCE_STATE_EXIT = 'inst:state:exit'
var INSTANCE_TWEEN = 'inst:tween'

function assert(cond, msg) {
    if (!cond) {
        console.error('Invariant violation')
        throw new Error(msg || 'Bad')
    }
}

export function AnimationDispatcher() {
    if (!this) {
        return new AnimationDispatcher.bind(undefined, arguments)  // XXX does this work?
    }

    this._sched = new AnimationScheduler()
}

AnimationDispatcher.prototype.add = function (transitions, states, initial) {
    var inst = new AnimationInstance(this, transitions, states, initial)
    inst.install()
    return inst
}

function AnimationScheduler() {
    assert(this && this !== window)
    this._ready = []
    this._frame = null
    this._handleFrame = this._handleFrame.bind(this)
}

AnimationScheduler.prototype.enq = function (task) {
    if (task) {
        this._ready.push(task)
    }

    this._requestFrame()
}

AnimationScheduler.prototype._requestFrame = function () {
    if (this._ready.length > 0 && this._frame === null) {
        this._frame = requestAnimationFrame(this._handleFrame)
    }
}

AnimationScheduler.prototype._handleFrame = function (timestamp) {
    this._frame = null

    var queue = this._ready
    this._ready = []

    var cbCount = queue.length
    assert(cbCount > 0)

    for (var i = 0; i < cbCount; i++) {
        var entry = queue[i]
        var repeated = false
        try {
            repeated = entry(timestamp)
        } catch (e) {
            console.error('Error in animation dispatch', e)
        }
        if (repeated) {
            this._ready.push(entry)
        }
    }

    this._requestFrame()
}

function AnimationInstance(dispatcher, transitions, states, initial) {
    assert(this && this !== window)
    this._sched = dispatcher._sched

    var transitionTable = {}

    transitions.forEach(function (entry) {
        setTransitionEntry(entry.from, entry.to, entry, false)
        if (entry.bidir) {
            setTransitionEntry(entry.to, entry.from, entry, true)
        }
    })

    function setTransitionEntry(from, to, entry, reversed) {
        var fromLookup = getProp(transitionTable, from)
        if (!fromLookup) {
            fromLookup = transitionTable[from] = {}
        } else {
            assert(!hasOwnProp(fromLookup, to))
        }
        fromLookup[to] = {
            tween: entry.tween || null,
            reversed: reversed,
        }
    }

    var stateTable = {}

    states.forEach(function (entry) {
        assert(!hasOwnProp(stateTable, entry.name))
        var tableEntry
        if (entry.action) {
            tableEntry = {
                enter: entry.action.enter || null,
                exit: entry.action.exit || null,
            }
        } else {
            tableEntry = {
                enter: null,
                exit: null,
            }
        }
        stateTable[entry.name] = tableEntry
    })

    this._trans = transitionTable
    this._states = stateTable
    this._cur = initial
    this._stateState = null
    this._stateIdx = 0
    this._installed = false
}

AnimationInstance.prototype.install = function () {
    assert(!this._installed)
    var inst = this
    var enter = this._states[this._cur].enter

    if (enter) {
        this._sched.enq(function () {
            inst._stateState = enter()
            inst._installed = true
            return false
        })
    }
}

Object.defineProperties(AnimationInstance.prototype, {
    state: {
        get: function () {
            return this._cur
        }
    },
    stateId: {
        get: function () {
            return this._stateIdx
        }
    },
})

AnimationInstance.prototype.goto = function (next) {
    var res
    var promise = new Promise(function (_res) {
        res = _res
    })

    var task = this._getTransitionTask(this._cur, next, res)
    this._sched.enq(task)
    this._cur = next
    this._stateIdx++

    return promise
}

var TT_EXIT_OLD = 0
var TT_TWEEN = 1
var TT_ENTER_NEW = 2
var TT_COMPLETE = 3

AnimationInstance.prototype._getTransitionTask = function (from, to, res) {
    var transEntry = this._getTrans(from, to)
    var tween = transEntry.tween

    var exit = this._states[from].exit
    var enter = this._states[to].enter

    var inst = this
    var startTime = null
    var ttState = TT_EXIT_OLD

    return function (timestamp) {
        var prevState
        do {
            console.log('TT_STATE %s', ttState)
            prevState = ttState
            switch (ttState) {
            case TT_EXIT_OLD:
                startTime = timestamp
                if (exit) {
                    exit(inst._stateState)
                    inst._stateState = null
                }
                ttState = TT_TWEEN
                break

            case TT_TWEEN:
                if (!tween) {
                    ttState = TT_ENTER_NEW
                    break
                }

                var tweenPoint = Math.min(timestamp - startTime, tween.duration)
                var tweenComplete = tweenPoint === tween.duration

                if (transEntry.reversed) {
                    tweenPoint = tween.duration - tweenPoint
                }

                // XXX: starting w/ linear easing
                var value = tween.start + (tween.end - tween.start) * (tweenPoint / tween.duration)
                console.log('tween value %s (reversed: %s)', value, !!transEntry.reversed)
                tween.update(value)

                if (tweenComplete) {
                    ttState = TT_ENTER_NEW
                }
                break

            case TT_ENTER_NEW:
                if (enter) {
                    inst._stateState = enter()
                }
                ttState = TT_COMPLETE
                break

            case TT_COMPLETE:
                break

            default:
                assert(false, `Unexpected XXX ${ttState}`)
                break
            }
        } while (prevState !== ttState && ttState !== TT_COMPLETE)

        var complete = ttState === TT_COMPLETE
        if (complete) {
            setTimeout(() => { res() }, 3 * 1000)
            // res()
        }
        console.log('TT end %s (%smore)', ttState, complete ? 'no ' : '')
        return !complete
    }
}

AnimationInstance.prototype._getTrans = function (from, to) {
    var entry = getProp(getProp(this._trans, from), to)

    if (!entry) {
        console.error('Illegal state transition %s -> %s', from, to)
        return DEFAULT_TRANS_ENTRY
    }

    console.log('State transition %s -> %s', from, to)
    return entry
}

var DEFAULT_TRANS_ENTRY = { tween: null, reversed: false }

AnimationInstance.prototype.clear = function () {}

var hasOwnProp = Object.hasOwnProperty
hasOwnProp = hasOwnProp.call.bind(Object.hasOwnProperty)

function getProp(obj, prop) {
    if (!obj || !hasOwnProp(obj, prop)) {
        return null
    }
    return obj[prop]
}

// function classTransition(setupClass, enableClass, opts) {
//     return {
//         begin: function (inst, sched, params) {
//             params.el.classList.add(setupClass);
//             inst.setDuration(opts.duration);
//             sched.nextTick(function () {
//                 params.el.classList.add(enableClass);
//             });
//         },
//         finish: function (inst, sched, params) {
//             params.el.classList.remove(setupClass);
//             params.el.classList.remove(enableClass);
//         },
//     }
// }

export function updateProperty(opts) {
    return {
        start: opts.start,
        end: opts.end,
        duration: opts.duration,
        update: function (value) {
            opts.el.style[opts.prop] = value
        },
    }
}

export function reverseTween(tween) {
    var start = tween.start
    var end = tween.end
    var reversed = Object.assign({}, tween, {
        update: function (value) {
            console.log('reverse %s to %s', value, end + (start - value))
            return tween.update(end + (start - value))
        }
    })
    return reversed
}

export function classSet(opts) {
    return {
        enter: function () {
            opts.el.classList.add(opts.cls)
        },
        exit: function () {
            opts.el.classList.remove(opts.cls)
        },
    }
}

export function appendElem(opts) {
    return {
        enter: function () {
            var el = opts.getEl()
            opts.parent.appendChild(el)
            return {
                el: el,
            }
        },
        exit: function (state) {
            var child = state.el
            if (child.parentElement) {
                child.parentElement.removeChild(child)
            }
        },
    }
}