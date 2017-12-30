import expect from 'expect'
import { AnimationScheduler, AnimationSchedulerQueue } from '../../src/js/animation'

describe('animation scheduler', function () {
    it('should throw if called without new', function () {
        expect(() => {
            AnimationScheduler()
        }).toThrow()
    })

    it('should handle exceptions during dispatch to queue', function () {
        const sched = new AnimationScheduler()
        const queue = new AnimationSchedulerQueue(sched)

        let res
        let queueCalled = false
        const promise = new Promise((_res) => { res = _res })

        const EXPECTED_CALLS = 1
        let count = 0

        queue._disp = function () {
            queueCalled = true
            AnimationSchedulerQueue.prototype._disp.call(queue)
            setTimeout(res)
            throw new Error('inserted queue failure')
        }

        queue.enq(function () {
            count++
            return false
        })

        return promise.then(() => {
            expect(count).toBe(EXPECTED_CALLS)
            expect(queueCalled).toBe(true)
            expectQueueInactive(queue)
            expectSchedInactive(sched)
        })
    })
})

describe('animation scheduler queue', function () {
    it('should throw if called without new', function () {
        const sched = new AnimationScheduler()
        expect(() => {
            AnimationSchedulerQueue(sched)
        }).toThrow()
    })

    it('should throw if called without a scheduler', function () {
        expect(() => {
            new AnimationSchedulerQueue()
        }).toThrow()
    })

    it('should dispatch and handle re-enqueuing', function () {
        const sched = new AnimationScheduler()
        const queue = new AnimationSchedulerQueue(sched)

        let res
        const promise = new Promise((_res) => { res = _res })

        const EXPECTED_CALLS = 2
        let count = 0

        queue.enq(function () {
            count++
            expect(count).toBeLessThan(EXPECTED_CALLS + 1)

            switch (count) {
            case 1:
                return true
            case 2:
                res()
                return false
            default:
                throw new Error('unreachable')
            }
        })

        return promise.then(() => {
            expect(count).toBe(EXPECTED_CALLS)
            expectQueueInactive(queue)
            expectSchedInactive(sched)
        })
    })

    it('should handle re-entrant task scheduling', function () {
        const sched = new AnimationScheduler()
        const queue = new AnimationSchedulerQueue(sched)

        let res
        const promise = new Promise((_res) => { res = _res })

        const EXPECTED_CALLS = 4
        let count = 0

        function reschedule() {
            count++
            expect(count).toBeLessThan(EXPECTED_CALLS + 1)

            switch (count) {
            case 1:
                queue.enq(reschedule)
                return true
            case 2:
                return false
            case 3:
                queue.enq(reschedule)
                return false
            case 4:
                res()
                return false
            default:
                throw new Error('unreachable')
            }
        }

        queue.enq(reschedule)

        return promise.then(() => {
            expect(count).toBe(EXPECTED_CALLS)
            expectQueueInactive(queue)
            expectSchedInactive(sched)
        })
    })

    it('should handle exceptions during dispatch', function () {
        const sched = new AnimationScheduler()
        const queue = new AnimationSchedulerQueue(sched)

        let res
        const promise = new Promise((_res) => { res = _res })

        const EXPECTED_CALLS = 1
        let count = 0
        let sentinelCalled = true

        queue.enq(function () {
            count++
            throw new Error('inserted task failure')
        })

        queue.enq(function () {
            sentinelCalled = true
            res()
            return false
        })

        return promise.then(() => {
            expect(count).toBe(EXPECTED_CALLS)
            expect(sentinelCalled).toBe(true)
            expectQueueInactive(queue)
            expectSchedInactive(sched)
        })
    })
})

function expectQueueInactive(queue) {
    expect(queue._tasks.length).toBe(0)
}

function expectSchedInactive(sched) {
    expect(sched._ready.length).toBe(0)
    expect(sched._frame).toBe(null)
}
