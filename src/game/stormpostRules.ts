export type Seal = 'coral' | 'azure' | 'gold'
export type Letter = { seal: Seal; wet: boolean; delivered: boolean }

export const DELIVERY_RADIUS = 42

export function deliveryScore(distance: number, wet: boolean, combo: number): number {
    if (distance > DELIVERY_RADIUS) return 0
    const base = 1000 + (distance <= 20 ? 400 : 0) + (wet ? 0 : 250)
    return Math.round(base * Math.min(2, 1 + combo * 0.5))
}

export function finalScore(score: number, seconds: number, hull: number): number {
    return score + Math.floor(Math.max(0, seconds)) * 8 + Math.max(0, hull) * 250
}

export function grade(score: number, rescued: boolean): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (!rescued) return 'D'
    if (score >= 5200) return 'S'
    if (score >= 4200) return 'A'
    if (score >= 3000) return 'B'
    return 'C'
}

export function wetFirstPending(letters: Letter[]): Letter[] {
    let changed = false
    return letters.map(letter => {
        if (!changed && !letter.delivered && !letter.wet) {
            changed = true
            return { ...letter, wet: true }
        }
        return letter
    })
}

export function canOpenGate(letters: Letter[]): boolean {
    return letters.length === 3 && letters.every(letter => letter.delivered)
}
