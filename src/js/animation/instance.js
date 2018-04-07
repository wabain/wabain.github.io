import debugFactory from 'debug'
import { assert, assertWarning } from '../assert'
import { reverseTween } from './updaters'

var debug = debugFactory('animation:instance')
var debugTransitions = debugFactory('animation:transitions')

var DEFAULT_TRANS_ENTRY = { tween: null }


function tweensCompatible(a, b) {
    if (!a)
        return !b
    else if (!b)
        return false

    return a.update === b.update &&
        a.start === b.start &&
        a.end === b.end
}

/**
 * @param {AnimationSchedulerQueue} dispatchQueue
 * @param {*} transitions
 * @param {*} states
 * @param {String} initial
 */
export default function AnimationInstance(dispatchQueue, transitions, states, initial) {
    assert(this && this !== window)
    assert(dispatchQueue && transitions && states)
    assert(typeof initial === 'string')
    this._q = dispatchQueue

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
        res = _res
    })

    if (!enter) {
        res()
    } else {
        this._q.enq(function () {
            inst._installed = true
            inst._stateState = enter()
            debug('Installation complete')
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
AnimationInstance.prototype.goto = function (next) {
    var inst = this
    var current = this._cur

    // Sanity check: throw if the state does not exist
    this._stateEntry(next)
    var transEntry = this._getTrans(current, next)

    var res, rej
    var promise = new Promise(function (_res, _rej) {
        res = _res
        rej = _rej
    })

    var transitionDescriptor = {
        tween: transEntry.tween,
        from: current,
        to: next,
        onStateExit: function () {
            var exit = inst._stateEntry(current).exit
            if (exit) {
                exit(inst._stateState)
            }
            inst._stateState = null
        },
        onStateEnter: function () {
            debug('State transition %s -> %s complete', current, next)
            var enter = inst._stateEntry(next).enter
            if (enter) {
                inst._stateState = enter()
            }
            res()
        },
        onInterrupt: function () {
            debug('State transition %s -> %s interrupted', current, next)
            rej(new Error('State transition ' + current + ' -> ' + next + ' interrupted'))
        }
    }

    if (this._pendingTrans) {
        this._pendingTrans.interrupt(transitionDescriptor)
    } else {
        this._pendingTrans = new TransitionRunner(transitionDescriptor)
        this._q.enq(function (ts) {
            var ongoing = inst._pendingTrans.update(ts)
            if (!ongoing) {
                inst._pendingTrans = null
                res()
            }
            return ongoing
        })
    }

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

AnimationInstance.prototype._getTrans = function (from, to) {
    var entry = getProp(getProp(this._trans, from), to)

    if (!assertWarning(entry, 'Illegal state transition %s -> %s', from, to))
        return DEFAULT_TRANS_ENTRY

    return entry
}

function TransitionRunner(descriptor) {
    this._ongoing = descriptor
    this._interrupt = null

    this._started = false
    this._startTime = null
    this._startPoint = descriptor.tween && descriptor.tween.reversed ? 1 : 0
    this._tweenPoint = this._startPoint
}

TransitionRunner.prototype.interrupt = function (descriptor) {
    assert(
        tweensCompatible(this._ongoing.tween, descriptor.tween),
        'State transition %s -> %s interrupts incompatible transition %s -> %s',
        descriptor.from, descriptor.to, this._ongoing.from, this._ongoing.to
    )

    this._interrupt = descriptor
}

TransitionRunner.prototype.update = function (timestamp) {
    var descriptor = this._ongoing

    if (!this._started) {
        debugTransitions('transition starting')
        this._startTime = timestamp
        this._started = true

        descriptor.onStateExit()
    }

    if (this._interrupt) {
        debugTransitions('transition interrupted')
        descriptor.onInterrupt()

        descriptor = this._ongoing = this._interrupt
        this._interrupt = null
        this._startTime = timestamp
        this._startPoint = this._tweenPoint
    }

    var tweenComplete = this._updateTween(timestamp)

    if (tweenComplete) {
        debugTransitions('transition complete')
        descriptor.onStateEnter()
    }

    return !tweenComplete
}

TransitionRunner.prototype._updateTween = function (timestamp) {
    var tween = this._ongoing.tween

    if (!tween) {
        return true
    }

    assert(typeof this._startTime === 'number', 'start time unset')

    var timeOffset = timestamp - this._startTime
    var tweenPoint = this._startPoint

    if (tween.reversed)
        tweenPoint -= timeOffset / tween.duration
    else
        tweenPoint += timeOffset / tween.duration

    tweenPoint = Math.max(0, Math.min(1, tweenPoint))
    this._tweenPoint = tweenPoint

    var tweenComplete = tween.reversed ? tweenPoint === 0 : tweenPoint === 1

    // XXX: starting w/ linear easing
    var value = tween.start + (tween.end - tween.start) * tweenPoint
    debugTransitions('tween value %s, point %s, reversed %s', value, tweenPoint, !!tween.reversed)
    tween.update(value)

    return tweenComplete
}

var hasOwnProp = Object.hasOwnProperty
hasOwnProp = hasOwnProp.call.bind(Object.hasOwnProperty)

function getProp(obj, prop) {
    if (!obj || !hasOwnProp(obj, prop)) {
        return null
    }
    return obj[prop]
}