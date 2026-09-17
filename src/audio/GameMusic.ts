// Ported from C:/Ai/zhugongkuaipao/music.js: native looping MP3, gesture unlock,
// and a shared Web Audio context for effects. Keep play() in the tap call stack.
export class GameMusic {
  readonly element:HTMLAudioElement;
  context:AudioContext|null=null;
  private url:string|null=null;
  private pending:Promise<void>|null=null;
  enabled=false;
  active=false;
  constructor(){
    this.element=document.createElement('audio');
    this.element.preload='auto';this.element.loop=true;this.element.volume=.65;
    this.element.hidden=true;this.element.setAttribute('playsinline','');
    document.body.append(this.element);
  }
  get ready(){return !!this.url;}
  get playing(){return !this.element.paused&&!this.element.ended&&this.element.readyState>=2;}
  prepare(blob:Blob){
    if(this.ready)return;
    if(!blob.size)throw new Error('音乐文件为空');
    this.url=URL.createObjectURL(blob);this.element.src=this.url;this.element.load();
  }
  enable(){this.enabled=true;return this.sync();}
  unlock():Promise<void>{
    const Context=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Context)return Promise.resolve();
    try{const session=(navigator as Navigator&{audioSession?:{type:string}}).audioSession;if(session)session.type='playback';}catch{/* Read-only in some webviews. */}
    try{
      if(!this.context||this.context.state==='closed')this.context=new Context();
      if(this.context.state==='running')return Promise.resolve();
      const resumed=this.context.resume(),pulse=this.context.createBufferSource();
      pulse.buffer=this.context.createBuffer(1,1,this.context.sampleRate);
      pulse.connect(this.context.destination);pulse.onended=()=>pulse.disconnect();pulse.start(0);
      return resumed;
    }catch(error){return Promise.reject(error);}
  }
  pause(){this.pending=null;this.element.pause();}
  disable(){this.enabled=false;this.pause();}
  setActive(active:boolean){
    if(this.active===active)return;
    this.active=active;void this.sync().catch(()=>{/* Next real tap retries. */});
  }
  sync():Promise<void>{
    if(!this.enabled||!this.active){this.pause();return Promise.resolve();}
    if(!this.ready)return Promise.reject(new Error('背景音乐尚未加载完成'));
    if(this.pending)return this.pending;
    if(this.playing)return Promise.resolve();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const playback=this.element.play();
      const attempt=Promise.race([playback,new Promise<void>((_,reject)=>{timer=setTimeout(()=>reject(new Error('请再次点击以开启声音')),4000);})])
        .catch(error=>{if(this.pending===attempt)this.element.pause();throw error;})
        .finally(()=>{clearTimeout(timer);if(this.pending===attempt)this.pending=null;});
      this.pending=attempt;return attempt;
    }catch(error){return Promise.reject(error);}
  }
  destroy(){
    this.disable();this.element.removeAttribute('src');this.element.load();this.element.remove();
    if(this.url)URL.revokeObjectURL(this.url);this.url=null;
    void this.context?.close().catch(()=>{});
  }
}
