import { assert } from '../assert'
import AnimationInstance from './instance'
export * from './updaters'

export function AnimationDispatcher() {
    if (!this) {
        return new AnimationDispatcher.bind(undefined, arguments)  // XXX does this work?
    }

    this._sched = new AnimationScheduler()
}

AnimationDispatcher.prototype.createAnimation = function (args) {
    var inst = new AnimationInstance(
        this._sched,
        args.transitions,
        args.states,
        args.initialState)

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
            // eslint-disable-next-line no-console
            console.error('Error in animation dispatch', e)
        }
        if (repeated) {
            this._ready.push(entry)
        }
    }

    this._requestFrame()
}