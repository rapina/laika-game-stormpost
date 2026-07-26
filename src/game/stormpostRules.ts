export type Seal = 'coral' | 'azure' | 'gold'
export type Letter = { seal: Seal; wet: boolean; delivered: boolean }
export type RouteLayout = {
    islands: { x:number; y:number; seal:Seal }[]
    updraft: { x:number; y:number }
    corridor: { x:number; halfWidth:number }
}

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

export function generateRoute(random:()=>number):RouteLayout {
    const seals:Seal[]=['coral','azure','gold']
    const ys=[620,430,245]
    const islands=seals.map((seal,i)=>({seal,y:ys[i],x:62+random()*266}))
    // Central lift stays at least 68px from every mailbox, leaving a readable
    // approach corridor while its horizontal position remains seed-driven.
    let x=80+random()*230
    for(const island of islands) if(Math.abs(x-island.x)<68)x+=x<195?68:-68
    const corridorX=Math.max(92,Math.min(298,x))
    return {islands,updraft:{x:corridorX,y:520},corridor:{x:corridorX,halfWidth:38}}
}

export function stampReward(score:number){return Math.max(0,Math.floor(score/1000))}
export function cosmeticTier(stamps:number){return stamps>=15?3:stamps>=9?2:stamps>=4?1:0}

export type LightningPhase='warning'|'active'|'cooldown'
export function lightningPhase(age:number):LightningPhase {
    const cycle=((age%4)+4)%4
    return cycle<1?'warning':cycle<1.65?'active':'cooldown'
}

export const SHIP_COLLISION_RADIUS=17
export function corridorClearance(halfWidth:number,hazardRadius:number){
    return halfWidth+hazardRadius+SHIP_COLLISION_RADIUS
}
export function placeOutsideCorridor(x:number,corridorX:number,halfWidth:number,hazardRadius:number){
    const required=corridorClearance(halfWidth,hazardRadius)
    if(Math.abs(x-corridorX)>=required)return x
    const left=corridorX-required, right=corridorX+required
    const leftValid=left>=25, rightValid=right<=365
    if(leftValid&&rightValid)return x<corridorX?left:right
    if(leftValid)return left
    if(rightValid)return right
    // Route generation constrains corridorX so this is unreachable for the
    // game's maximum radius, but retain the farther edge as a safe fallback.
    return corridorX-25>365-corridorX?25:365
}

export function altitudeAfter(altitude:number,dt:number,inLift:boolean){
    const rate=inLift?22:-2.8
    return Math.max(0,Math.min(100,altitude+rate*dt))
}
