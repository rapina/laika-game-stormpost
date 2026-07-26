import { APP_CONFIG } from '../appConfig'
import { getLocale } from '../i18n'
import { logicRandom } from './logicRng'
import type { GameCallbacks, GameRuntime } from './types'
import { altitudeAfter, canOpenGate, corridorClearance, cosmeticTier, deliveryScore, finalScore, generateRoute, grade, lightningPhase, placeOutsideCorridor, stampReward, wetFirstPending, type Letter, type Seal } from './stormpostRules'
import { StormAudio } from './StormAudio'

const W = APP_CONFIG.designWidth
const H = APP_CONFIG.designHeight
const RUN_SECONDS = 360
const colors: Record<Seal, string> = { coral: '#ef6f61', azure: '#63c7d5', gold: '#f4cf7a' }
const tr = {
    ko: { route: '폭풍 항로', drag: '드래그: 조향  ·  놓기: 투하  ·  탭: 돌풍', gate: '폭풍 관문으로!', delivered: '배달 완료', miss: '빗나감', paused: '항로 일시정지', return: '귀환 성공', lost: '조난', tap: '화면을 눌러 출항', dry: '건조', wet: '젖음' },
    en: { route: 'STORM ROUTE', drag: 'DRAG: STEER  ·  RELEASE: DROP  ·  TAP: GUST', gate: 'FLY TO THE STORM GATE!', delivered: 'DELIVERED', miss: 'MISSED', paused: 'ROUTE PAUSED', return: 'RETURNED', lost: 'LOST', tap: 'TAP TO DEPART', dry: 'DRY', wet: 'WET' },
}

type Island = { x: number; y: number; seal: Seal; pulse: number }
type Hazard = { x: number; y: number; vx: number; vy:number; age:number; kind: 'cloud' | 'birds'; r: number }
type Rain = { x: number; y: number; s: number }

export class StormpostGame implements GameRuntime {
    private canvas!: HTMLCanvasElement
    private ctx!: CanvasRenderingContext2D
    private cb!: GameCallbacks
    private raf = 0
    private last = 0
    private started = false
    private over = false
    private paused = false
    private ship = { x: W / 2, y: H * .7, vx: 0, vy: 0, angle: 0, hull: 4, inv: 0 }
    private pointer: { id: number; x: number; y: number; at: number; moved: boolean } | null = null
    private keys = new Set<string>()
    private elapsed = 0
    private score = 0
    private combo = 0
    private gust = 1
    private charge = 0
    private message = ''
    private messageTime = 0
    private flash = 0
    private result = { grade: 'D', score: 0 }
    private endedAt = 0
    private letters: Letter[] = [
        { seal: 'coral', wet: false, delivered: false },
        { seal: 'azure', wet: false, delivered: false },
        { seal: 'gold', wet: false, delivered: false },
    ]
    private islands: Island[] = []
    private updraft={x:W/2,y:H*.52}
    private hazards: Hazard[] = []
    private rain: Rain[] = []
    private locale: 'ko' | 'en' = 'ko'
    private resizeObs: ResizeObserver | null = null
    private audio = new StormAudio()
    private routeOffset=0
    private stamps=0
    private cosmetic=0
    private altitude=76
    private corridor={x:W/2,halfWidth:38}
    private altitudeDamageReady=true

    async mount(container: HTMLElement, callbacks: GameCallbacks): Promise<void> {
        this.cb = callbacks
        this.locale = getLocale() === 'en' ? 'en' : 'ko'
        const route=generateRoute(logicRandom)
        this.islands=route.islands.map((x,i)=>({...x,pulse:i*2}))
        this.updraft=route.updraft
        this.corridor=route.corridor
        try{this.stamps=Number(localStorage.getItem('stormpost:stamps')||0)||0}catch{this.stamps=0}
        this.cosmetic=cosmeticTier(this.stamps)
        this.canvas = document.createElement('canvas')
        // Backing store covers the largest supported phone even when the
        // letterboxed CSS canvas grows beyond the 390px design width.
        const backingScale = Math.max(3, Math.min(4, (devicePixelRatio || 1) * 1.34))
        this.canvas.width = Math.ceil(W * backingScale)
        this.canvas.height = Math.ceil(H * backingScale)
        this.ctx = this.canvas.getContext('2d')!
        this.ctx.scale(this.canvas.width / W, this.canvas.height / H)
        this.canvas.setAttribute('aria-label', 'Stormpost flight canvas')
        container.appendChild(this.canvas)
        const fit = () => {
            const scale = Math.min(container.clientWidth / W, container.clientHeight / H)
            this.canvas.style.width = `${W * scale}px`; this.canvas.style.height = `${H * scale}px`
        }
        fit(); this.resizeObs = new ResizeObserver(fit); this.resizeObs.observe(container)
        for (let i = 0; i < 9; i++) {const rawX=35+logicRandom()*320,kind=i%3?'cloud':'birds',r=19+logicRandom()*12;this.hazards.push({ x: placeOutsideCorridor(rawX,this.corridor.x,this.corridor.halfWidth,r), y: 120 + logicRandom() * 580, vx: (logicRandom() - .5) * 25, vy:18+logicRandom()*18, age:logicRandom()*4, kind, r })}
        for (let i = 0; i < 100; i++) this.rain.push({ x: logicRandom() * W, y: logicRandom() * H, s: 250 + logicRandom() * 300 })
        this.bind()
        ;(globalThis as any).__forceGameOver = () => this.finish(canOpenGate(this.letters))
        ;(globalThis as any).__gameDesignSize = { w: W, h: H }
        this.last = performance.now()
        this.raf = requestAnimationFrame(this.loop)
    }

    private bind() {
        this.canvas.addEventListener('pointerdown', this.down)
        this.canvas.addEventListener('pointermove', this.move)
        this.canvas.addEventListener('pointerup', this.up)
        window.addEventListener('keydown', this.keyDown)
        window.addEventListener('keyup', this.keyUp)
        document.addEventListener('visibilitychange', this.visibility)
    }
    private down = (e: PointerEvent) => {
        e.preventDefault(); this.audio.unlock(); this.canvas.setPointerCapture(e.pointerId)
        const p = this.pos(e); this.pointer = { id: e.pointerId, ...p, at: performance.now(), moved: false }
        if (!this.started) this.started = true
        if (this.over) return
    }
    private move = (e: PointerEvent) => {
        if (!this.pointer || e.pointerId !== this.pointer.id) return
        const p = this.pos(e); this.pointer.moved ||= Math.hypot(p.x - this.pointer.x, p.y - this.pointer.y) > 10
        this.pointer.x = p.x; this.pointer.y = p.y
    }
    private up = (e: PointerEvent) => {
        if (!this.pointer || e.pointerId !== this.pointer.id) return
        const short = performance.now() - this.pointer.at < 180 && !this.pointer.moved
        this.pointer = null
        if (this.over) { if(performance.now()-this.endedAt>700)this.restart(); return }
        if (short) this.releaseGust(); else this.drop()
    }
    private keyDown = (e: KeyboardEvent) => {
        this.keys.add(e.key.toLowerCase())
        if (e.key === ' ') { e.preventDefault(); this.drop() }
        if (e.key === 'Shift') this.releaseGust()
        if (e.key.toLowerCase() === 'p') { this.paused = !this.paused; this.audio.setPaused(this.paused) }
        if (e.key.toLowerCase() === 'm') { this.audio.unlock(); this.audio.toggleMute() }
    }
    private keyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())
    private visibility = () => { if (document.hidden && this.started && !this.over) { this.paused = true; this.audio.setPaused(true) } }
    private pos(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)*W/r.width, y: (e.clientY-r.top)*H/r.height } }

    private loop = (now: number) => {
        const dt = Math.min(.033, (now - this.last) / 1000); this.last = now
        if (this.started && !this.over && !this.paused) this.update(dt)
        this.draw(now / 1000)
        this.raf = requestAnimationFrame(this.loop)
    }
    private update(dt: number) {
        this.elapsed += dt; this.routeOffset=(this.routeOffset+dt*14)%H; this.ship.inv = Math.max(0, this.ship.inv-dt); this.messageTime -= dt; this.flash = Math.max(0, this.flash-dt)
        let tx = this.ship.x, ty = this.ship.y
        if (this.pointer) { tx = this.pointer.x; ty = this.pointer.y }
        if (this.keys.has('arrowleft') || this.keys.has('a')) tx -= 100
        if (this.keys.has('arrowright') || this.keys.has('d')) tx += 100
        if (this.keys.has('arrowup') || this.keys.has('w')) ty -= 100
        if (this.keys.has('arrowdown') || this.keys.has('s')) ty += 100
        this.ship.vx += (tx-this.ship.x)*2.7*dt; this.ship.vy += (ty-this.ship.y)*2.7*dt
        this.ship.vx *= Math.pow(.08, dt); this.ship.vy *= Math.pow(.08, dt)
        this.ship.x = Math.max(25, Math.min(W-25, this.ship.x+this.ship.vx*dt))
        this.ship.y = Math.max(100, Math.min(H-38, this.ship.y+this.ship.vy*dt))
        this.ship.angle = this.ship.vx * .006
        this.audio.update((this.ship.x/W-.5)*2,Math.hypot(this.ship.vx,this.ship.vy))
        const inLift = Math.hypot(this.ship.x-this.updraft.x, this.ship.y-this.updraft.y) < 72
        this.altitude=altitudeAfter(this.altitude,dt,inLift)
        if(this.altitude<=0&&this.altitudeDamageReady){this.altitudeDamageReady=false;this.hit(this.ship.x);this.altitude=28;this.say(this.locale==='ko'?'고도 상실 · 선체 충격':'ALTITUDE LOST · HULL IMPACT')}
        if(this.altitude>35)this.altitudeDamageReady=true
        if (inLift) { this.charge += dt; if (this.charge > 2.5 && this.gust < 3) { this.gust++; this.charge = 0; this.audio.tone('sail',(this.ship.x/W-.5)*2) } }
        for (const h of this.hazards) {
            h.age+=dt;h.x += h.vx*dt;h.y+=h.vy*dt;if(h.y>H+35)h.y=95
            if (h.x < -30) h.x=W+30; if (h.x>W+30) h.x=-30
            if(Math.abs(h.x-this.corridor.x)<corridorClearance(this.corridor.halfWidth,h.r)){h.x=placeOutsideCorridor(h.x,this.corridor.x,this.corridor.halfWidth,h.r);h.vx*=-1}
            const dangerous=h.kind==='birds'||lightningPhase(h.age)==='active'
            if (dangerous&&this.ship.inv <= 0 && Math.hypot(this.ship.x-h.x,this.ship.y-h.y)<h.r+17) this.hit(h.x)
        }
        for (const r of this.rain) { r.y += r.s*dt; r.x -= r.s*.12*dt; if (r.y>H) { r.y=-10;r.x=logicRandom()*W } if(r.x<0)r.x=W }
        if (canOpenGate(this.letters) && this.ship.y < 122 && Math.abs(this.ship.x-W/2)<72) this.finish(true)
        if (this.elapsed >= RUN_SECONDS || this.ship.hull<=0) this.finish(false)
    }
    private hit(sourceX:number) {
        this.ship.hull--; this.ship.inv=1.2; this.letters=wetFirstPending(this.letters); this.combo=0; this.flash=.25
        this.audio.tone('hit',(sourceX/W-.5)*2)
        navigator.vibrate?.([30,25,45]); this.say(this.locale==='ko'?'돛 손상 · 편지가 젖었습니다':'SAIL DAMAGED · LETTER WET')
    }
    private releaseGust() {
        if (!this.started || this.over || this.gust<=0) return
        this.gust--; this.ship.inv=.7; this.flash=.12; navigator.vibrate?.(18)
        this.audio.tone('gust',(this.ship.x/W-.5)*2)
        for(const h of this.hazards){const dx=h.x-this.ship.x,dy=h.y-this.ship.y,d=Math.hypot(dx,dy)||1;if(d<130){h.x+=dx/d*90;h.y+=dy/d*90}}
        this.say(this.locale==='ko'?'돌풍 방출!':'GUST RELEASED!')
    }
    private drop() {
        if (!this.started || this.over) return
        let best: { i:number; d:number; island:Island } | undefined
        for (const island of this.islands) {
            const i=this.letters.findIndex(l=>l.seal===island.seal)
            if(i<0||this.letters[i].delivered) continue
            const d=Math.hypot(this.ship.x-island.x,this.ship.y-island.y)
            if(!best||d<best.d) best={i,d,island}
        }
        if (!best || best.d>42) { this.combo=0; this.say(tr[this.locale].miss); return }
        const letter=this.letters[best.i]; let points=deliveryScore(best.d,letter.wet,this.combo)
        if(letter.seal==='gold') points += this.letters.filter(l=>l.delivered).length < 2 ? 900 : 500
        this.score+=points; this.combo=Math.min(2,this.combo+1); this.letters[best.i]={...letter,delivered:true}; best.island.pulse=10
        this.cb.onScoreChange?.(this.score); navigator.vibrate?.([18,20,18]); this.say(`${tr[this.locale].delivered} +${points}`)
        this.audio.tone('delivery',(best.island.x/W-.5)*2)
        if(canOpenGate(this.letters)) { this.say(tr[this.locale].gate); this.audio.tone('gate') }
    }
    private say(s:string){this.message=s;this.messageTime=2}
    private finish(rescued:boolean){
        if(this.over)return;this.over=true;this.endedAt=performance.now();this.audio.setPaused(true)
        const total=finalScore(this.score,RUN_SECONDS-this.elapsed,this.ship.hull)
        this.result={score:total,grade:grade(total,rescued)}
        this.stamps+=stampReward(total);try{localStorage.setItem('stormpost:stamps',String(this.stamps))}catch{/* sandboxed arcade keeps run-local stamps */}this.cosmetic=cosmeticTier(this.stamps)
        ;(globalThis as any).__gameOverUiBoxes=[{name:'result',x:35,y:220,w:320,h:390}]
        this.cb.onGameOver({score:total,phase:this.letters.filter(l=>l.delivered).length})
    }
    private restart() {
        this.over=false;this.started=true;this.audio.setPaused(false);this.elapsed=0;this.score=0;this.combo=0;this.gust=1;this.charge=0;this.altitude=76;this.altitudeDamageReady=true
        this.ship={x:W/2,y:H*.7,vx:0,vy:0,angle:0,hull:4,inv:0}
        this.letters=[
            {seal:'coral',wet:false,delivered:false},
            {seal:'azure',wet:false,delivered:false},
            {seal:'gold',wet:false,delivered:false},
        ]
        delete (globalThis as any).__gameOverUiBoxes
        this.cb.onScoreChange?.(0)
    }

    private draw(t:number) {
        const c=this.ctx;c.save();c.clearRect(0,0,W,H)
        const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#071b2a');sky.addColorStop(.55,'#164955');sky.addColorStop(1,'#8b7861');c.fillStyle=sky;c.fillRect(0,0,W,H)
        c.globalAlpha=.12;c.fillStyle='#fff';for(let i=0;i<9;i++){c.beginPath();c.ellipse((i*73+t*8)%500-50,(80+i*83+this.routeOffset)%H,110,35,0,0,7);c.fill()}c.globalAlpha=1
        this.drawLift(c,t); this.islands.forEach(x=>this.drawIsland(c,x,t)); this.hazards.forEach(h=>this.drawHazard(c,h,t))
        c.strokeStyle='rgba(190,230,232,.32)';c.lineWidth=1;for(const r of this.rain){c.beginPath();c.moveTo(r.x,r.y);c.lineTo(r.x-7,r.y+18);c.stroke()}
        this.drawGate(c,t);this.drawShip(c,t);this.drawHud(c)
        if(!this.started)this.drawIntro(c);if(this.paused)this.overlay(c,tr[this.locale].paused,'P');if(this.over)this.drawResult(c)
        if(this.flash){c.fillStyle=`rgba(255,255,255,${this.flash*2})`;c.fillRect(0,0,W,H)}
        c.restore()
    }
    private drawLift(c:CanvasRenderingContext2D,t:number){c.save();c.translate(this.updraft.x,this.updraft.y);for(let i=0;i<4;i++){c.strokeStyle=`rgba(116,231,210,${.15+i*.05})`;c.lineWidth=3;c.beginPath();c.arc(0,0,28+i*12,(t+i)*1.3,(t+i)*1.3+4.4);c.stroke()}c.fillStyle='#a5f1d222';c.beginPath();c.ellipse(0,0,62,90,0,0,7);c.fill();c.restore()}
    private drawIsland(c:CanvasRenderingContext2D,i:Island,t:number){c.save();c.translate(i.x,i.y+Math.sin(t+i.pulse)*3);c.fillStyle='#253d3c';c.beginPath();c.moveTo(-45,4);c.quadraticCurveTo(0,42,45,4);c.quadraticCurveTo(0,-18,-45,4);c.fill();c.fillStyle='#6f8d62';c.beginPath();c.ellipse(0,-2,45,14,0,0,7);c.fill();c.fillStyle='#e9d6a0';c.fillRect(-8,-38,16,30);c.fillStyle=colors[i.seal];c.fillRect(-12,-43,24,8);c.strokeStyle='#fff8';c.strokeRect(-12,-43,24,8);c.restore()}
    private drawHazard(c:CanvasRenderingContext2D,h:Hazard,t:number){c.save();c.translate(h.x,h.y);if(h.kind==='birds'){c.strokeStyle='#10191e';c.lineWidth=3;for(let i=-1;i<=1;i++){c.beginPath();c.arc(i*14,Math.sin(t*4+i)*5,8,3.5,5.9);c.stroke();c.beginPath();c.arc(i*14+15,Math.sin(t*4+i)*5,8,3.5,5.9);c.stroke()}}else{const phase=lightningPhase(h.age);c.fillStyle=phase==='warning'?'#7a6844':phase==='active'?'#34425a':'#1d2a38dd';for(let i=-1;i<2;i++){c.beginPath();c.arc(i*15,0,h.r*.7,0,7);c.fill()}if(phase==='warning'){c.strokeStyle=`rgba(255,220,100,${.45+.45*Math.sin(t*14)})`;c.lineWidth=3;c.beginPath();c.arc(0,0,h.r+8,0,7);c.stroke()}if(phase==='active'){c.strokeStyle='#f5dc82';c.lineWidth=4;c.beginPath();c.moveTo(0,12);c.lineTo(-8,30);c.lineTo(2,27);c.lineTo(-5,48);c.stroke()}}c.restore()}
    private drawGate(c:CanvasRenderingContext2D,t:number){const open=canOpenGate(this.letters);c.save();c.translate(W/2,65);c.strokeStyle=open?'#f4cf7a':'#52646c';c.lineWidth=8;c.beginPath();c.arc(0,0,58,0,Math.PI);c.stroke();if(open){c.strokeStyle=`rgba(244,207,122,${.4+.3*Math.sin(t*4)})`;c.lineWidth=18;c.stroke()}c.restore()}
    private drawShip(c:CanvasRenderingContext2D,t:number){const s=this.ship;c.save();c.translate(s.x,s.y);c.rotate(s.angle);c.globalAlpha=s.inv&&Math.sin(t*24)>0?.35:1;c.fillStyle=this.cosmetic>=1?'#8b5936':'#6c412c';c.beginPath();c.moveTo(-18,8);c.lineTo(18,8);c.lineTo(11,24);c.lineTo(-12,24);c.closePath();c.fill();c.strokeStyle='#ead8ac';c.lineWidth=3;c.beginPath();c.moveTo(0,10);c.lineTo(0,-28);c.stroke();c.fillStyle=this.cosmetic>=2?'#8fd6c8':'#f1c77c';c.beginPath();c.moveTo(2,-24);c.quadraticCurveTo(25,-8+Math.sin(t*5)*3,3,5);c.closePath();c.fill();if(this.cosmetic>=3){c.strokeStyle='#f4cf7a';c.beginPath();c.arc(0,12,27,0,7);c.stroke()}c.fillStyle='#ef6f61';c.beginPath();c.arc(0,16,5,0,7);c.fill();c.restore()}
    private drawHud(c:CanvasRenderingContext2D){c.fillStyle='#06151ccc';c.fillRect(12,12,W-24,78);c.strokeStyle='#7ba9a5';c.strokeRect(12,12,W-24,78);c.fillStyle='#f7e8bd';c.font='bold 15px Galmuri11';c.fillText(tr[this.locale].route,24,35);c.font='12px Galmuri11';c.fillText(`${Math.max(0,Math.ceil(RUN_SECONDS-this.elapsed))}s  ✦${this.stamps}`,300,35);c.fillText(`♥ ${'◆'.repeat(this.ship.hull)}  ↯ ${this.gust}/3`,24,58);c.fillText(`${this.score.toString().padStart(5,'0')}  ×${(1+this.combo*.5).toFixed(1)}`,245,58);c.fillStyle='#29464c';c.fillRect(167,69,92,9);c.fillStyle=this.altitude<25?'#ef6f61':'#8fd6c8';c.fillRect(167,69,92*this.altitude/100,9);c.fillStyle='#e8dbc0';c.font='9px Galmuri11';c.fillText(`ALT ${Math.round(this.altitude)}`,181,78);this.letters.forEach((l,n)=>{c.fillStyle=l.delivered?'#76937b':colors[l.seal];c.fillRect(24+n*45,69,34,9);if(l.wet&&!l.delivered){c.fillStyle='#7fa9be';c.fillRect(26+n*45,71,30,5)}});if(this.messageTime>0){c.fillStyle='#071b2add';c.fillRect(45,108,300,36);c.fillStyle='#fff3cd';c.textAlign='center';c.fillText(this.message,W/2,132);c.textAlign='left'}}
    private drawIntro(c:CanvasRenderingContext2D){c.fillStyle='#06141ddd';c.fillRect(24,160,W-48,520);c.strokeStyle='#f4cf7a';c.lineWidth=2;c.strokeRect(24,160,W-48,520);c.textAlign='center';c.fillStyle='#f4cf7a';c.font='bold 31px Galmuri14';c.fillText(this.locale==='ko'?'폭풍 우편':'STORMPOST',W/2,225);c.font='15px Galmuri11';c.fillStyle='#e8dbc0';c.fillText(tr[this.locale].drag,W/2,275);this.letters.forEach((l,n)=>{c.fillStyle=colors[l.seal];c.beginPath();c.arc(110+n*85,355,24,0,7);c.fill();c.fillStyle='#071b2a';c.fillRect(98+n*85,349,24,13)});c.fillStyle='#bcd1cf';c.font='13px Galmuri11';const lines=this.locale==='ko'?['세 계약을 배달하세요','구름과 새를 피하고 상승 기류를 타세요','모든 봉인이 켜지면 관문으로 귀환합니다']:['DELIVER ALL THREE CONTRACTS','DODGE CLOUDS · RIDE THE UPDRAFT','LIGHT THE SEALS AND RETURN'];lines.forEach((x,i)=>c.fillText(x,W/2,430+i*36));c.fillStyle='#f4cf7a';c.font='bold 17px Galmuri11';c.fillText(tr[this.locale].tap,W/2,610);c.textAlign='left'}
    private overlay(c:CanvasRenderingContext2D,a:string,b:string){c.fillStyle='#06141de8';c.fillRect(0,0,W,H);c.textAlign='center';c.fillStyle='#f4cf7a';c.font='bold 26px Galmuri14';c.fillText(a,W/2,H/2);c.font='14px Galmuri11';c.fillText(b,W/2,H/2+44);c.textAlign='left'}
    private drawResult(c:CanvasRenderingContext2D){c.fillStyle='#06141df0';c.fillRect(35,220,320,390);c.strokeStyle='#f4cf7a';c.lineWidth=2;c.strokeRect(35,220,320,390);c.textAlign='center';c.fillStyle='#e8dbc0';c.font='bold 20px Galmuri11';c.fillText(this.result.grade==='D'?tr[this.locale].lost:tr[this.locale].return,W/2,275);c.fillStyle='#f4cf7a';c.font='bold 92px Galmuri14';c.fillText(this.result.grade,W/2,385);c.font='bold 25px Galmuri11';c.fillText(this.result.score.toString(),W/2,440);c.font='14px Galmuri11';c.fillStyle='#bcd1cf';c.fillText(`${this.letters.filter(l=>l.delivered).length}/3  ·  ♥ ${this.ship.hull}`,W/2,485);c.font='13px Galmuri11';c.fillText(this.locale==='ko'?'결과 화면으로 이동합니다':'OPENING RESULTS',W/2,560);c.textAlign='left'}

    destroy(){cancelAnimationFrame(this.raf);this.audio.destroy();this.resizeObs?.disconnect();this.canvas?.removeEventListener('pointerdown',this.down);this.canvas?.removeEventListener('pointermove',this.move);this.canvas?.removeEventListener('pointerup',this.up);window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);document.removeEventListener('visibilitychange',this.visibility);delete (globalThis as any).__forceGameOver}
    getDebugState(){return{over:this.over,score:this.score,timeLeft:Math.round((RUN_SECONDS-this.elapsed)*10)/10,started:this.started,delivered:this.letters.filter(l=>l.delivered).length,hull:this.ship.hull,gust:this.gust,altitude:Math.round(this.altitude),paused:this.paused}}
}
