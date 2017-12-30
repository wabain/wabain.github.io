import expect from 'expect'

import { AnimationDispatcher } from '../../src/js/animation'

describe('animation dispatcher', () => {
    it('should throw if called without new', () => {
        expect(() => {
            AnimationDispatcher()
        }).toThrow()
    })

    it('should allow animation instances to be created', () => {
        const disp = new AnimationDispatcher()
        const anim = disp.createAnimation({
            initialState: 'A',
            states: [
                { name: 'A' },
                { name: 'B' },
            ],
            transitions: [
                {
                    from: 'A',
                    to: 'B',
                    bidir: true,
                }
            ]
        })

        expect(anim.state).toBe('A')
    })
})
