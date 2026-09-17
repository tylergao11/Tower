import { CARD, LEVEL, VIEW } from './config';

interface Save { deck:string[]; cleared:boolean; gold:boolean }
const key='tower:'+LEVEL.id;
export function loadSave():Save {
  try {
    const value=JSON.parse(localStorage.getItem(key)||'null');
    if(value&&Array.isArray(value.deck)){
      const deck=[...new Set<string>(value.deck.filter((id:unknown):id is string=>typeof id==='string'&&Object.hasOwn(CARD,id)))];
      return {deck:deck.length===LEVEL.deckSize?deck:[...LEVEL.defaultDeck],cleared:value.cleared===true,gold:value.gold===true};
    }
  } catch { /* A blocked store does not prevent playing. */ }
  return {deck:[...LEVEL.defaultDeck],cleared:false,gold:false};
}
export function saveProgress(value:Save) {try {localStorage.setItem(key,JSON.stringify(value));} catch { /* Session play remains available. */ }}

export function fitStage() {
  const viewport=document.querySelector<HTMLElement>('#viewport')!;
  const stage=document.querySelector<HTMLElement>('#stage')!;
  const resize=()=>{
    const box=viewport.getBoundingClientRect();
    const scale=Math.min(box.width/VIEW.width,box.height/VIEW.height);
    stage.style.setProperty('--fit',String(scale));
    window.dispatchEvent(new CustomEvent('stage-resize'));
  };
  new ResizeObserver(resize).observe(viewport);resize();
}

export class AudioPlayer {
  enabled=true;
  private context?:AudioContext;
  private last=0;
  unlock() {if(!this.context)this.context=new AudioContext();void this.context.resume();}
  play(kind:string) {
    const context=this.context;
    if(!this.enabled||!context||context.state!=='running'||context.currentTime-this.last<.075)return;
    this.last=context.currentTime;
    const oscillator=context.createOscillator(),gain=context.createGain();
    const frequencies:Record<string,number>={coin:880,rescue:660,shield:330,slam:80,hit:140,break:100};
    oscillator.type=kind==='coin'||kind==='rescue'?'sine':'triangle';
    oscillator.frequency.setValueAtTime(frequencies[kind]||180,context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime((frequencies[kind]||180)*.55,context.currentTime+.12);
    gain.gain.setValueAtTime(.035,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.15);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.16);
  }
}
