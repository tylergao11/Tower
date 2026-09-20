import { LEVEL, createDeck } from './config';
import bgmUrl from '../assets/audio/liu-run-bgm-v1.mp3';
import { GameMusic } from './audio/GameMusic';

export const BGM_BYTES=947053;

interface Save { deck:string[]; cleared:boolean; gold:boolean }
const key='tower:'+LEVEL.id;
export function loadSave():Save {
  try {
    const value=JSON.parse(localStorage.getItem(key)||'null');
    if(value&&Array.isArray(value.deck)){
      const deck=createDeck(value.deck.filter((id:unknown):id is string=>typeof id==='string'));
      return {deck,cleared:value.cleared===true,gold:value.gold===true};
    }
  } catch { /* A blocked store does not prevent playing. */ }
  return {deck:createDeck(),cleared:false,gold:false};
}
export function saveProgress(value:Save) {try {localStorage.setItem(key,JSON.stringify(value));} catch { /* Session play remains available. */ }}

export class AudioPlayer {
  private soundEnabled=true;
  private music=new GameMusic();
  private last=0;
  get enabled(){return this.soundEnabled;}
  set enabled(value:boolean){this.soundEnabled=value;if(!value)this.music.disable();}
  async prepare(progress:(value:number)=>void){
    const response=await fetch(bgmUrl);
    if(!response.ok)throw new Error(`Music download failed: ${response.status}`);
    if(response.body){
      const reader=response.body.getReader(),parts:ArrayBuffer[]=[];
      const total=Number(response.headers.get('content-length'))||BGM_BYTES;let loaded=0;
      for(;;){const {done,value}=await reader.read();if(done)break;parts.push(Uint8Array.from(value).buffer);loaded+=value.byteLength;progress(loaded/total);}
      this.music.prepare(new Blob(parts,{type:'audio/mpeg'}));
    }else this.music.prepare(await response.blob());
    progress(1);
  }
  setActive(active:boolean){this.music.setActive(active);}
  unlock(){
    if(!this.enabled||document.hidden)return;
    void this.music.unlock().catch(()=>{});
    if(this.music.ready)void this.music.enable().catch(()=>{});
  }
  destroy(){this.music.destroy();}
  play(kind:string) {
    const context=this.music.context;
    if(!this.enabled||!context||context.state!=='running'||kind!=='boss'&&context.currentTime-this.last<.075)return;
    this.last=context.currentTime;
    if(kind==='boss'){
      for(const [frequency,delay] of [[65,0],[49,.18],[98,.38]]){
        const tone=context.createOscillator(),volume=context.createGain(),at=context.currentTime+delay;
        tone.type='sawtooth';tone.frequency.setValueAtTime(frequency,at);tone.frequency.exponentialRampToValueAtTime(frequency*.55,at+.9);
        volume.gain.setValueAtTime(.001,at);volume.gain.exponentialRampToValueAtTime(.055,at+.025);volume.gain.exponentialRampToValueAtTime(.001,at+1.1);
        tone.connect(volume);volume.connect(context.destination);tone.start(at);tone.stop(at+1.12);
      }
      return;
    }
    const oscillator=context.createOscillator(),gain=context.createGain();
    const frequencies:Record<string,number>={coin:880,rescue:660,shield:330,slam:80,hit:140,break:100};
    oscillator.type=kind==='coin'||kind==='rescue'?'sine':'triangle';
    oscillator.frequency.setValueAtTime(frequencies[kind]||180,context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime((frequencies[kind]||180)*.55,context.currentTime+.12);
    gain.gain.setValueAtTime(.035,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.15);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.16);
  }
}
