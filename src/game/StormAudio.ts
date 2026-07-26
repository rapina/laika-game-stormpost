export class StormAudio {
    private ctx: AudioContext | null = null
    private master: GainNode | null = null
    private windGain: GainNode | null = null
    private windPan: StereoPannerNode | null = null
    private windSource: AudioBufferSourceNode | null = null
    private muted = false
    private paused = false

    unlock() {
        if (this.ctx) { void this.ctx.resume(); return }
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        const ctx = new AC()
        const master = ctx.createGain()
        master.gain.value = .42
        master.connect(ctx.destination)
        const windGain = ctx.createGain()
        windGain.gain.value = .08
        const pan = ctx.createStereoPanner()
        windGain.connect(pan).connect(master)
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        let smooth = 0
        for (let i=0;i<data.length;i++) { smooth = smooth*.985 + (Math.random()*2-1)*.015; data[i]=smooth }
        const source = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        filter.type='lowpass'; filter.frequency.value=720
        source.buffer=buffer; source.loop=true; source.connect(filter).connect(windGain); source.start()
        this.ctx=ctx;this.master=master;this.windGain=windGain;this.windPan=pan;this.windSource=source
    }

    update(x: number, speed: number) {
        if (!this.ctx || !this.windGain || !this.windPan) return
        const now=this.ctx.currentTime
        this.windPan.pan.setTargetAtTime(Math.max(-1,Math.min(1,x)),now,.12)
        this.windGain.gain.setTargetAtTime(.055+Math.min(.11,speed*.0012),now,.15)
    }

    tone(kind:'gust'|'delivery'|'hit'|'gate'|'sail', pan=0) {
        if (!this.ctx || !this.master || this.muted || this.paused) return
        const c=this.ctx, now=c.currentTime
        const notes = kind==='delivery'?[523,659,784]:kind==='gate'?[392,523,659]:kind==='gust'?[180,280]:kind==='hit'?[95,55]:[210]
        notes.forEach((frequency,index)=>{
            const osc=c.createOscillator(), gain=c.createGain(), p=c.createStereoPanner()
            osc.type=kind==='hit'?'sawtooth':kind==='gust'?'triangle':'sine'
            osc.frequency.setValueAtTime(frequency,now+index*.07)
            if(kind==='gust')osc.frequency.exponentialRampToValueAtTime(frequency*1.8,now+.18)
            gain.gain.setValueAtTime(.0001,now+index*.07)
            gain.gain.exponentialRampToValueAtTime(kind==='hit'?.18:.11,now+index*.07+.012)
            gain.gain.exponentialRampToValueAtTime(.0001,now+index*.07+.3)
            p.pan.value=Math.max(-1,Math.min(1,pan))
            osc.connect(gain).connect(p).connect(this.master!)
            osc.start(now+index*.07);osc.stop(now+index*.07+.34)
        })
    }

    toggleMute(){this.muted=!this.muted;if(this.master)this.master.gain.value=this.muted?0:.42;return this.muted}
    setPaused(paused:boolean){this.paused=paused;if(!this.ctx)return;void(paused?this.ctx.suspend():this.ctx.resume())}
    destroy(){try{this.windSource?.stop()}catch{/* already stopped */}void this.ctx?.close();this.ctx=null;this.master=null}
}
