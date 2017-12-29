import debugFactory from 'debug'
import { assert, assertWarning } from '../assert'
import { reverseTween } from './updaters'

var debug = debugFactory('animation:instance')
var debugTransitions = debugFactory('animation:transitions')

var TT_EXIT_OLD = 0
var TT_TWEEN = 1
var TT_ENTER_NEW = 2
var TT_COMPLETE = 3
var TT_STATE_LOOKUP = [
    'exit-old',
    'tween',
    'enter-new',
    'complete',
]
var DEFAULT_TRANS_ENTRY = { tween: null }


/**
 *
 * @param {*} dispatcher
 * @param {*} transitions
 * @param {*} states
 * @param {*} initial
 */
export default function AnimationInstance(scheduler, transitions, states, initial) {
    assert(this && this !== window)
    this._sched = scheduler

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

        var tween = getProp(entry, 'tween')
        if (reversed && tween) {
            tween = reverseTween(tween)
        }

        fromLookup[to] = {
            tween: tween,
        }
    }

    var stateTable = {}

    states.forEach(function (entry) {
        assert(!hasOwnProp(stateTable, entry.name))
        stateTable[entry.name] = {
            enter: getProp(entry.action, 'enter'),
            exit: getProp(entry.action, 'exit'),
        }
    })

    this._trans = transitionTable
    this._states = stateTable
    this._cur = initial
    this._pendingTrans = null
    this._stateState = null
    this._stateIdx = 0
    this._installed = false
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

AnimationInstance.prototype.install = function () {
    assert(!this._installed)
    var inst = this
    var enter = this._stateEntry(this._cur).enter
    var res
    var promise = new Promise(function (_res) {
        res = function () {
            debug('Installation complete')
            _res()
        }
    })

    if (enter) {
        this._pendingTrans = {}
        this._sched.enq(function () {
            inst._installed = true
            inst._stateState = enter()
            inst._pendingTrans = null
            res()
            return false
        })
    }

    return promise
}

/**
 * Initiate the transition to the new state. Return a promise which resolves
 * when the transition is complete, and is rejected if the transition is
 * interrupted or encounters an error.
 */
AnimationInstance.prototype.goto = function (next, opts) {
    var current = this._cur
    var incremental = !!getProp(opts, 'incremental')

    assert(!this._pendingTrans,
        'State transition %s -> %s attempted while transition pending',
        current, next)

    var res, rej
    var promise = new Promise(function (_res, _rej) {
        res = function () {
            debug('State transition %s -> %s complete', current, next)
            _res()
        }
        rej = function (err) {
            debug('State transition %s -> %s interrupted', current, next, err)
            _rej(err)
        }
    })

    var task = this._getTransitionTask(this._cur, next, res, rej)
    this._pendingTrans = {}
    this._sched.enq(task)
    this._cur = next
    this._stateIdx++

    debug('State transition %s -> %s scheduled', current, next)

    return promise
}

AnimationInstance.prototype._stateEntry = function (state) {
    var entry = this._states[state]
    assert(entry, 'Missing entry for %s', state)
    return entry
}

AnimationInstance.prototype._getTransitionTask = function (from, to, res, rej) {
    var transEntry = this._getTrans(from, to)
    var tween = transEntry.tween

    var exit = this._stateEntry(from).exit
    var enter = this._stateEntry(to).enter

    var inst = this
    var startTime = null
    var ttState = TT_EXIT_OLD

    return function (timestamp) {
        var continueTransitionLoop = true
        do {
            debugTransitions('transition state %s', TT_STATE_LOOKUP[ttState])
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

                if (tween.reversed) {
                    tweenPoint = tween.duration - tweenPoint
                }

                // XXX: starting w/ linear easing
                var value = tween.start + (tween.end - tween.start) * (tweenPoint / tween.duration)
                debugTransitions('tween value %s (reversed: %s)', value, !!tween.reversed)
                tween.update(value)

                if (tweenComplete) {
                    ttState = TT_ENTER_NEW
                } else {
                    /* Wait for the next animation frame to be dispatched */
                    continueTransitionLoop = false
                }
                break

            case TT_ENTER_NEW:
                if (enter) {
                    inst._stateState = enter()
                }
                ttState = TT_COMPLETE
                break

            case TT_COMPLETE:
                continueTransitionLoop = false
                break

            default:
                assert(false, 'Unexpected transition state %s', ttState)
                break
            }
        } while (continueTransitionLoop)

        debugTransitions('transition ends in state %s', TT_STATE_LOOKUP[ttState])

        var complete = ttState === TT_COMPLETE
        if (complete) {
            // XXX: not really the right place
            inst._pendingTrans = null
            res()
        }
        return !complete
    }
}

AnimationInstance.prototype._getTrans = function (from, to) {
    var entry = getProp(getProp(this._trans, from), to)

    if (!assertWarning(entry, 'Illegal state transition %s -> %s', from, to))
        return DEFAULT_TRANS_ENTRY

    return entry
}

// TODO
AnimationInstance.prototype.clear = function () {}

var hasOwnProp = Object.hasOwnProperty
hasOwnProp = hasOwnProp.call.bind(Object.hasOwnProperty)

function getProp(obj, prop) {
    if (!obj || !hasOwnProp(obj, prop)) {
        return null
    }
    return obj[prop]
}