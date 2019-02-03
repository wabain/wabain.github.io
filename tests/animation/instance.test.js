import expect from 'expect'

import { AnimationScheduler, AnimationSchedulerQueue } from '../../src/js/animation'
import AnimationInstance from '../../src/js/animation/instance'

const SIMPLE_STATES = [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
]

const SIMPLE_TRANSITIONS = [
    { from: 'A', to: 'B', bidir: true },
    { from: 'A', to: 'C' },
    { from: 'C', to: 'B' },
]

describe('animation instance', () => {
    it('should throw if called without new', () => {
        const queue = createQueue()
        expect(() => {
            AnimationInstance(queue, SIMPLE_TRANSITIONS, SIMPLE_STATES, 'A')
        }).toThrow()
    })
    it('should throw on missing initializer arguments', () => {
        const queue = createQueue()

        expect(() => {
            new AnimationInstance(undefined, SIMPLE_TRANSITIONS, SIMPLE_STATES, 'A')
        }).toThrow()

        expect(() => {
            new AnimationInstance(queue, undefined, SIMPLE_STATES, 'A')
        }).toThrow()

        expect(() => {
            new AnimationInstance(queue, SIMPLE_TRANSITIONS, undefined, 'A')
        }).toThrow()

        expect(() => {
            new AnimationInstance(queue, SIMPLE_TRANSITIONS, SIMPLE_STATES, undefined)
        }).toThrow()
    })

    it('should throw if state change requested before install')

    it('should handle single- and bidirectional state transitions', () => {
        const queue = createQueue()
        const inst = new AnimationInstance(queue, SIMPLE_TRANSITIONS, SIMPLE_STATES, 'A')

        let expectedStateId = 0

        return inst.install().then(() => {
            return verifyAndUpdateState('A')
        }).then(() => {
            return gotoAndVerifyState('B')
        }).then(() => {
            return gotoAndVerifyState('A')
        }).then(() => {
            return gotoAndVerifyState('C')
        }).then(() => {
            return gotoAndVerifyState('B')
        })

        function gotoAndVerifyState(state) {
            const transition = inst.goto(state)
            verifyAndUpdateState(state)
            return transition
        }

        function verifyAndUpdateState(state) {
            expect(inst.state).toBe(state)
            expect(inst.stateId).toBe(expectedStateId++)
        }
    })

    it('should handle transitions while install is pending', () => {
        const queue = createQueue()

        const { tracker: aTracker, action: aAction } = getActionTracker()
        const { tracker: bTracker, action: bAction } = getActionTracker()

        const states = [
            { name: 'A', action: aAction },
            { name: 'B', action: bAction },
        ]

        const transitions = [
            { from: 'A', to: 'B' },
        ]

        const inst = new AnimationInstance(queue, transitions, states, 'A')

        // Kick off install
        const installPromise = inst.install()

        expect(inst.state).toBe('A')
        expect(inst.stateId).toBe(0)

        // Install should run asynchronously
        expect(aTracker.count).toBe(0)
        expect(bTracker.count).toBe(0)

        // Kick off transition
        const transitionPromise = inst.goto('B')

        // Current state should be update synchronously
        expect(inst.state).toBe('B')
        expect(inst.stateId).toBe(1)

        // ...but state transitions should be evaluated asynchronously
        expect(aTracker.count).toBe(0)
        expect(bTracker.count).toBe(0)

        return installPromise.then(() => {
            expect(aTracker.count).toBe(1)
            expect(bTracker.count).toBe(0)
            return transitionPromise
        }).then(() => {
            expect(aTracker.count).toBe(0)
            expect(bTracker.count).toBe(1)
        })
    })

    it('should throw early on unknown states', () => {
        const queue = createQueue()
        const inst = new AnimationInstance(queue, SIMPLE_TRANSITIONS, SIMPLE_STATES, 'A')

        return inst.install().then(() => {
            expect(() => {
                inst.goto('qwerty')
            }).toThrow()

            expect(inst.state).toBe('A')
            expect(inst.stateId).toBe(0)
        })
    })

    // it('should warn and handle illegal transitions')

    // it('should handle transition tweens'/*, () => {
    //     const queue = createQueue()

    //     const { tracker: aTracker, action: aAction } = getActionTracker()
    //     const { tracker: bTracker, action: bAction } = getActionTracker()

    //     const states = [
    //         { name: 'A', action: aAction },
    //         { name: 'B', action: bAction },
    //     ]

    //     const transitions = [
    //         { from: 'A', to: 'B' },
    //     ]

    // }*/)

    // it('should handle transition interruption', () => {

    // })

    // it('should throw early(?) on transition interruption with incompatible tweens')
})

function createQueue() {
    const sched = new AnimationScheduler()
    return new AnimationSchedulerQueue(sched)
}

function getActionTracker() {
    const tracker = { count: 0 }
    return {
        tracker,
        action: {
            enter: () => { tracker.count++ },
            exit: () => { tracker.count-- },
        }
    }
}
