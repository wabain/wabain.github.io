import { assert } from '../assert'
import AnimationInstance from './instance'
export * from './updaters'

export function AnimationDispatcher() {
    assert(this && this !== window)
    this._sched = new AnimationScheduler()
}

AnimationDispatcher.prototype.createAnimation = function (args) {
    var queue = new AnimationSchedulerQueue(this._sched)
    var inst = new AnimationInstance(
        queue,
        args.transitions,
        args.states,
        args.initialState)

    inst.install()
    return inst
}

export function AnimationScheduler() {
    assert(this && this !== window)
    this._ready = []
    this._frame = null
    this._handleFrame = this._handleFrame.bind(this)
}

AnimationScheduler.prototype._wakeup = function (queue) {
    assert(queue instanceof AnimationSchedulerQueue)
    this._ready.push(queue)
    this._requestFrame()
}

AnimationScheduler.prototype._requestFrame = function () {
    if (this._ready.length > 0 && this._frame === null) {
        this._frame = requestAnimationFrame(this._handleFrame)
    }
}

AnimationScheduler.prototype._handleFrame = function (timestamp) {
    this._frame = null

    var readyQueues = this._ready
    this._ready = []

    var cbCount = readyQueues.length
    assert(cbCount > 0)

    for (var i = 0; i < cbCount; i++) {
        var entry = readyQueues[i]
        var repeated = invokeGuarded(
            entry._disp,
            entry,
            [timestamp],
            false,
            'animation queue dispatch')

        if (repeated) {
            // It seems like re-entrant calls could do ugly things here, but
            // queues shouldn't be calling wakeup during their dispatch, and
            // as long as that's the case this seems to be okay.
            this._ready.push(entry)
        }
    }

    this._requestFrame()
}

export function AnimationSchedulerQueue(sched) {
    assert(sched instanceof AnimationScheduler)
    this._sched = sched
    this._tasks = []
}

AnimationSchedulerQueue.prototype.enq = function (task) {
    this._tasks.push(task)
    if (this._tasks.length === 1) {
        this._sched._wakeup(this)
    }
}

AnimationSchedulerQueue.prototype._disp = function (timestamp) {
    assert(this._tasks.length, 'disp tasks')

    var repeated = invokeGuarded(
        this._tasks[0],
        null,
        [timestamp],
        false,
        'animation task dispatch')

    if (repeated) {
        return true
    }

    this._tasks.shift()
    return !!this._tasks.length
}

function invokeGuarded(fn, ctx, args, fallback, invocationDescription) {
    var returned = fallback
    try {
        returned = fn.apply(ctx, args)
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error in ' + invocationDescription, e)
    }
    return returned
}
