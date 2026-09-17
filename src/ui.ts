import { CARD, CARDS, LEVEL, RULES, VIEW, type CardDef } from './config';
import type { Battle } from './game/Battle';
import { loadSave, saveProgress } from './platform';
import { previewFor } from './render/art';
import { stageCoordinates } from './viewport';

export interface UIController {
  battle:Battle; selectedCard?:string; selectedUnit?:number;
  start(deck:string[]):void; restart(select:boolean):void;
  action(type:string,uid?:number):void; toggleSound():void;
}
const escapeText=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const coin='<i class="coin" aria-hidden="true"></i>';
function imageFor(id:string,className='unit-portrait') {return `<img class="${className}" src="${previewFor(id)}" alt="" draggable="false">`;}
function button(action:string,label:string,primary=false,disabled=false,uid?:number) {
  return `<button class="paper-button${primary?' primary':''}" data-action="${action}" ${uid===undefined?'':`data-uid="${uid}"`} ${disabled?'disabled':''}>${label}</button>`;
}
function cardMarkup(c:CardDef,selected=false,locked=false) {
  return `<button class="card ${selected?'chosen':''} ${c.kind==='income'?'economy-card':''} ${locked?'required-card':''}" data-card="${c.id}" aria-label="${c.name}，军饷 ${c.cost}${locked?'，必选，不可取消':''}" aria-pressed="${selected}" ${locked?'aria-disabled="true"':''}>${imageFor(c.id,'card-art')}${c.kind==='income'?'<span class="card-purpose">产军饷</span>':''}<span class="card-cooldown" aria-hidden="true"></span><span class="card-info"><strong class="card-name">${c.name}</strong><span class="card-price">${coin}${c.cost}</span></span><span class="cooldown-time"></span><span class="card-check" aria-hidden="true">${locked?'必选':'✓'}</span></button>`;
}
function soundIcon(){return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 12h6l8-7v22l-8-7H4z" fill="currentColor"/><path d="M23 9q8 7 0 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';}

export class UI {
  private root:HTMLElement;
  private modal:HTMLElement;
  private deck:HTMLElement;
  private lordDanger:HTMLElement;
  private lordDirection:HTMLElement;
  private lordArrow:SVGElement;
  private lastPhase='';
  private deckSelection:string[];
  private saved=loadSave();
  private pauseConfirm=false;
  private unitChoices:number[]=[];
  private detailMarkup='';
  private dragPreview:HTMLDivElement;
  private dragId='';
  private soundOn=true;
  private selectionNotice='';
  constructor(private controller:UIController) {
    this.deckSelection=[...LEVEL.defaultDeck];
    this.root=document.getElementById('ui')!;
    this.root.innerHTML=`
      <div class="battle-header"><div class="game-logo" role="img" aria-label="主公快跑，新野"></div><div class="topbar"><div class="chapter"><strong>新野 · 守城</strong><span id="wave-status"></span></div><div class="top-actions"><button class="paper-button sound-button" data-action="sound" aria-label="关闭声音" aria-pressed="true">${soundIcon()}</button><button class="paper-button pause-button" data-action="pause" aria-label="暂停"><i></i><i></i></button></div></div></div>
      <div id="toast" class="hidden" role="status"></div><div id="unit-detail"></div>
      <div class="battle-bottom"><div class="motto motto-left">守住新野<br>护住主公<small>— 蜀军军令 —</small></div><div class="battle-tray"><div class="treasury"><span>${coin}</span><strong id="money">200</strong><small>军饷</small></div><div id="deck-bar"></div><div class="emergency"><button class="skill skill-shield" data-action="shield" aria-label="护驾"><i></i><strong>护驾</strong></button></div></div><div class="motto motto-right">人在城在<br>主公无恙<small>— 新野营帐 —</small></div></div>
      <div id="lord-danger" aria-hidden="true" hidden></div>
      <div id="lord-direction" role="status" aria-label="主公在视野外" hidden><svg viewBox="0 0 80 80" aria-hidden="true"><path d="M12 28H43V13L70 40 43 67V52H12Z"/></svg><strong>主公</strong></div>
      <div id="modal"></div>`;
    this.modal=this.root.querySelector('#modal')!;this.deck=this.root.querySelector('#deck-bar')!;
    this.lordDanger=this.root.querySelector('#lord-danger')!;this.lordDirection=this.root.querySelector('#lord-direction')!;
    this.lordArrow=this.lordDirection.querySelector('svg')!;
    this.dragPreview=document.createElement('div');this.dragPreview.id='drag-preview';this.dragPreview.hidden=true;
    this.dragPreview.style.width=this.dragPreview.style.height=`${VIEW.input.previewSize}px`;
    this.dragPreview.setAttribute('aria-hidden','true');this.root.append(this.dragPreview);
    this.bindRosterScroll();
    this.root.addEventListener('click',event=>this.click(event));this.update();
  }
  trackLord(point:{x:number;y:number},viewport:{x:number;y:number;width:number;height:number}){
    const b=this.controller.battle,active=b.active&&!b.paused;
    const danger=active&&(b.lord.state==='grabbing'||b.lord.state==='carried');
    this.lordDanger.hidden=!danger;
    const outside=point.x<viewport.x||point.x>viewport.x+viewport.width||point.y<viewport.y||point.y>viewport.y+viewport.height;
    this.lordDirection.hidden=!active||!outside;
    if(this.lordDirection.hidden)return;
    const cx=viewport.x+viewport.width/2,cy=viewport.y+viewport.height/2,dx=point.x-cx,dy=point.y-cy;
    const edgeScale=Math.min(dx===0?Infinity:(viewport.width/2-60)/Math.abs(dx),dy===0?Infinity:(viewport.height/2-60)/Math.abs(dy));
    this.lordDirection.style.left=`${cx+dx*edgeScale}px`;this.lordDirection.style.top=`${cy+dy*edgeScale}px`;
    this.lordArrow.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
    this.lordDirection.classList.toggle('danger',danger);
    this.lordDirection.querySelector('strong')!.textContent=danger?'快救主公':b.lord.state==='dropped'?'主公待救':'主公';
  }
  private bindRosterScroll(){
    let drag:{pointerId:number;pane:HTMLElement;coordinates:ReturnType<typeof stageCoordinates>;startX:number;startY:number;lastY:number;moved:boolean}|undefined;
    let suppressClickUntil=0;
    const cancel=()=>{
      const previous=drag;drag=undefined;
      if(previous?.pane.hasPointerCapture(previous.pointerId))previous.pane.releasePointerCapture(previous.pointerId);
    };
    this.root.addEventListener('pointerdown',event=>{
      if(drag||!event.isPrimary||event.button!==0)return;
      const pane=(event.target as Element).closest<HTMLElement>('.selection-cards');
      if(!pane)return;
      const coordinates=stageCoordinates(document.getElementById('stage')!);
      drag={pointerId:event.pointerId,pane,coordinates,startX:event.clientX,startY:event.clientY,lastY:coordinates(event.clientX,event.clientY).y,moved:false};
    });
    const move=(event:PointerEvent)=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!drag.moved){
        if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<VIEW.input.dragThreshold)return;
        drag.moved=true;drag.pane.setPointerCapture(event.pointerId);
      }
      const point=drag.coordinates(event.clientX,event.clientY);
      drag.pane.scrollTop+=drag.lastY-point.y;drag.lastY=point.y;
      event.preventDefault();
    };
    this.root.addEventListener('pointermove',move);
    this.root.addEventListener('pointerup',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      move(event);
      if(drag.moved){suppressClickUntil=performance.now()+250;event.preventDefault();}
      cancel();
    });
    for(const type of ['pointercancel','lostpointercapture'] as const)this.root.addEventListener(type,event=>{
      if(event.pointerId===drag?.pointerId&&(type!=='lostpointercapture'||event.target===drag.pane))cancel();
    });
    this.root.addEventListener('click',event=>{
      if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    window.addEventListener('stage-resize',cancel);
    window.addEventListener('blur',cancel);
  }
  showDrag(id:string,x:number,y:number,valid:boolean){
    if(this.dragId!==id){this.dragId=id;this.dragPreview.style.backgroundImage=`url("${previewFor(id)}")`;}
    this.dragPreview.hidden=false;this.dragPreview.style.left=`${x}px`;this.dragPreview.style.top=`${y}px`;
    this.dragPreview.classList.toggle('valid',valid);this.root.classList.add('dragging');
  }
  hideDrag(){this.dragPreview.hidden=true;this.root.classList.remove('dragging');}
  scrollCards(distance:number){this.deck.scrollLeft+=distance;}
  private setDetail(html:string){if(this.detailMarkup!==html){this.detailMarkup=html;this.root.querySelector('#unit-detail')!.innerHTML=html;}}
  private click(event:MouseEvent) {
    const target=(event.target as Element).closest<HTMLButtonElement>('button');if(!target||target.disabled)return;
    if(target.dataset.card){
      const id=target.dataset.card;
      if(this.controller.battle.phase==='select'){
        if(LEVEL.requiredCards.includes(id))return;
        this.selectionNotice='';
        if(this.deckSelection.includes(id))this.deckSelection=this.deckSelection.filter(c=>c!==id);
        else if(this.deckSelection.length<LEVEL.deckSize)this.deckSelection.push(id);
        else this.selectionNotice='已满';
        this.selection();
      }
      return;
    }
    const action=target.dataset.action;if(!action)return;
    if(action==='reset-deck'){this.deckSelection=[...LEVEL.requiredCards];this.selectionNotice='';this.selection();return;}
    if(action==='start'){
      if(this.deckSelection.length!==LEVEL.deckSize)return;
      this.saved.deck=[...this.deckSelection];saveProgress(this.saved);this.controller.start(this.deckSelection);
    }else if(action==='restart'){this.pauseConfirm=true;this.pausePanel();}
    else if(action==='confirm-restart'){this.pauseConfirm=false;this.controller.restart(true);}
    else if(action==='resume'){this.pauseConfirm=false;this.controller.battle.paused=false;}
    else if(action==='retry')this.controller.restart(false);
    else if(action==='change')this.controller.restart(true);
    else if(action==='sound'){
      this.controller.toggleSound();this.soundOn=!this.soundOn;
      target.classList.toggle('muted',!this.soundOn);target.setAttribute('aria-pressed',String(this.soundOn));target.setAttribute('aria-label',this.soundOn?'关闭声音':'开启声音');
    }else this.controller.action(action,target.dataset.uid?Number(target.dataset.uid):undefined);
    this.update();
  }
  private selection() {
    const scrollTop=this.modal.querySelector('.selection-cards')?.scrollTop||0;
    this.modal.className='visible selection-modal';
    const missing=LEVEL.deckSize-this.deckSelection.length;
    const roster=[...CARDS].sort((a,b)=>Number(!!b.mobile)-Number(!!a.mobile));
    this.modal.innerHTML=`<section class="selection panel" aria-label="布防选卡"><header class="panel-heading"><div><span class="faction-seal">蜀</span><h1>新野布防</h1></div><strong class="loadout-count ${this.selectionNotice?'is-full':''}" role="status"><span>${this.selectionNotice||'出战'}</span><b>${this.deckSelection.length}<em>/ ${LEVEL.deckSize}</em></b></strong></header><div class="selection-cards">${roster.map(c=>`<div class="selection-choice ${c.hero?'hero-choice':''}">${cardMarkup(c,this.deckSelection.includes(c.id),LEVEL.requiredCards.includes(c.id))}<span>${c.tip}</span></div>`).join('')}</div><footer class="selection-footer"><div class="selection-actions">${button('reset-deck','重置')}${button('start',missing?`再选 ${missing} 张`:'开始布防',true,missing>0)}</div></footer></section>`;
    this.modal.querySelector('.selection-cards')!.scrollTop=scrollTop;
  }
  private pausePanel() {
    this.modal.className='visible';
    this.modal.innerHTML=`<section class="pause panel"><span class="faction-seal">蜀</span><h1>${this.pauseConfirm?'重新布防？':'稍事休整'}</h1><p>${this.pauseConfirm?'本局进度将清空，返回选卡。':'战斗已暂停'}</p><div class="modal-actions">${button(this.pauseConfirm?'confirm-restart':'resume',this.pauseConfirm?'确认重开':'继续守城',true)}${button(this.pauseConfirm?'resume':'restart',this.pauseConfirm?'返回战斗':'重新开始')}</div></section>`;
  }
  private settlement() {
    const b=this.controller.battle,won=b.phase==='won';
    if(won){this.saved.cleared=true;this.saved.gold ||=b.perfect;saveProgress(this.saved);}
    this.modal.className='visible';
    this.modal.innerHTML=`<section class="settlement panel"><span class="faction-seal ${b.perfect?'gold-seal':''}">${b.perfect?'金':'蜀'}</span><h1>${won?(b.perfect?'金印 · 主公未被抓':'守住了'):'主公被掳走了'}</h1><p>${won?'八波曹军已退，新野守住了。':`刘备被${escapeText(b.loser)}带出城外左侧撤离口。`}</p><div class="battle-record">${[['被抓',b.stats.captures],['解救',b.stats.rescues],['机关损失',b.stats.losses],['消灭',b.stats.kills],['用时',`${Math.floor(b.stats.time/60)}分${Math.floor(b.stats.time%60)}秒`]].map(([label,value])=>`<span>${label}<strong>${value}</strong></span>`).join('')}</div><div class="modal-actions">${button('retry','原阵容重试',true)}${button('change','换阵再战')}</div></section>`;
  }
  chooseUnits(units:Array<{uid:number;def:CardDef}>) {this.unitChoices=units.map(u=>u.uid);this.update();}
  update() {
    const b=this.controller.battle,phase=b.paused?'paused':b.phase;
    if(phase!==this.lastPhase){
      this.lastPhase=phase;
      if(phase==='select')this.selection();else if(phase==='paused')this.pausePanel();else if(phase==='won'||phase==='lost')this.settlement();else {this.modal.className='';this.modal.innerHTML='';}
      if(b.active&&this.deck.dataset.deck!==b.deck.join(',')){this.deck.dataset.deck=b.deck.join(',');this.deck.innerHTML=b.deck.map(id=>cardMarkup(CARD[id])).join('');}
    }
    this.root.classList.toggle('selecting',b.phase==='select');
    const money=this.root.querySelector<HTMLElement>('#money')!,balance=String(Math.floor(b.money));
    money.textContent=balance;money.style.fontSize=balance.length>3?`${Math.max(22,Math.floor(160/balance.length))}px`:'';
    this.root.querySelector('#wave-status')!.textContent=b.phase==='prepare'?`布防 ${Math.ceil(b.countdown)} 秒`:b.phase==='rest'?`整备 ${Math.ceil(b.countdown)} 秒`:`第 ${Math.max(1,b.wave)} / ${LEVEL.waves.length} 波`;
    const toast=this.root.querySelector('#toast')!;toast.classList.toggle('hidden',b.time>=b.messageUntil||!b.message||b.phase==='select');toast.textContent=b.message;
    for(const card of this.deck.querySelectorAll<HTMLElement>('[data-card]')){
      const id=card.dataset.card!,def=CARD[id],cd=b.cooldowns[id]||0,selected=this.controller.selectedCard===id;
      card.classList.toggle('chosen',selected);card.setAttribute('aria-pressed',String(selected));card.classList.toggle('unavailable',b.money<def.cost||cd>0);
      card.querySelector<HTMLElement>('.card-cooldown')!.style.height=`${cd/def.cooldown*100}%`;
      card.classList.toggle('unaffordable',b.money<def.cost);
      card.querySelector('.cooldown-time')!.textContent=cd>0?`${Math.ceil(cd)}秒`:'';
    }
    const shield=this.root.querySelector<HTMLButtonElement>('[data-action="shield"]')!;
    shield.disabled=!b.shieldUses||!b.active||b.paused||b.lord.shield>0||!['idle','grabbing'].includes(b.lord.state)||b.lord.floor!==LEVEL.lord.floor||b.lord.x!==LEVEL.lord.x;
    shield.setAttribute('aria-label',b.shieldUses?'护驾':'护驾已用');
    const selected=b.units.find(u=>u.uid===this.controller.selectedUnit);
    if(selected){
      this.unitChoices=[];
      const def=selected.def,refund=Math.floor(def.cost*RULES.refund*selected.hp/def.hp),unavailable=!b.active||b.paused;
      this.setDetail(`${imageFor(def.id)}<div class="unit-description"><strong>${def.name}</strong><span>${def.mobile?'生命':'耐久'} ${Math.ceil(selected.hp)} / ${def.hp}</span><span>${def.tip}</span></div>${def.manual?button('activate',selected.ready>0?'布设中':selected.cooldown>0?`装填 ${Math.ceil(selected.cooldown)}秒`:'发动',true,unavailable||selected.cooldown>0||selected.ready>0,selected.uid):''}${def.kind==='log'&&b.time-selected.born<RULES.faceWindow?button('turn',selected.facing<0?'朝左 ←':'朝右 →',false,unavailable,selected.uid):''}${button('sell',`${def.mobile?'撤回':'拆除'} +${refund}`,false,unavailable,selected.uid)}<button class="detail-close" data-action="deselect" aria-label="关闭详情">×</button>`);
    }else if(this.controller.selectedCard){this.unitChoices=[];this.setDetail('');}
    else{
      const choices=b.units.filter(u=>u.hp>0&&this.unitChoices.includes(u.uid));this.unitChoices=choices.map(u=>u.uid);
      this.setDetail(choices.length?`<div class="stack-choice">${choices.map(u=>`<button data-action="select" data-uid="${u.uid}">${imageFor(u.def.id)}<strong>${u.def.name}</strong></button>`).join('')}</div>`:'');
    }
  }
  reset(){this.lastPhase='';this.setDetail('');this.hideDrag();this.unitChoices=[];this.pauseConfirm=false;this.update();}
}
