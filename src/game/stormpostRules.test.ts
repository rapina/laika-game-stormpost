import { describe, expect, it } from 'vitest'
import { canOpenGate, cosmeticTier, deliveryScore, finalScore, generateRoute, grade, lightningPhase, stampReward, wetFirstPending, type Letter } from './stormpostRules'

const letters = (): Letter[] => [
    { seal: 'coral', wet: false, delivered: false },
    { seal: 'azure', wet: false, delivered: false },
    { seal: 'gold', wet: false, delivered: false },
]

describe('Stormpost delivery contract', () => {
    it('rejects a drop outside the mailbox radius and rewards precision/dry state/combo', () => {
        expect(deliveryScore(43, false, 2)).toBe(0)
        expect(deliveryScore(20, false, 2)).toBe(3300)
        expect(deliveryScore(30, true, 0)).toBe(1000)
    })

    it('wets only the first pending dry letter', () => {
        const result = wetFirstPending(letters())
        expect(result.map(x => x.wet)).toEqual([true, false, false])
        expect(wetFirstPending(result).map(x => x.wet)).toEqual([true, true, false])
    })

    it('opens the gate only after exactly three completed contracts', () => {
        expect(canOpenGate(letters())).toBe(false)
        expect(canOpenGate(letters().map(x => ({ ...x, delivered: true })))).toBe(true)
    })

    it('calculates return bonuses and grade thresholds', () => {
        expect(finalScore(3000, 10.9, 3)).toBe(3830)
        expect(grade(5200, true)).toBe('S')
        expect(grade(9999, false)).toBe('D')
    })
    it('creates a reproducible seeded route with bounded islands and lift',()=>{
        const seq=[.1,.8,.4,.6];let i=0
        const a=generateRoute(()=>seq[i++%seq.length]);i=0
        const b=generateRoute(()=>seq[i++%seq.length])
        expect(a).toEqual(b)
        expect(a.islands.map(x=>x.seal)).toEqual(['coral','azure','gold'])
        expect(a.islands.every(x=>x.x>=62&&x.x<=328)).toBe(true)
        expect(a.updraft.x).toBeGreaterThanOrEqual(72)
    })
    it('stages lightning warning before damage and cooldown',()=>{
        expect(lightningPhase(.5)).toBe('warning')
        expect(lightningPhase(1.2)).toBe('active')
        expect(lightningPhase(2)).toBe('cooldown')
    })
    it('awards persistent stamp quantities and cosmetic thresholds',()=>{
        expect(stampReward(3999)).toBe(3)
        expect([3,4,9,15].map(cosmeticTier)).toEqual([0,1,2,3])
    })
})
