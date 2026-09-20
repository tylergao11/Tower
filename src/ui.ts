import { CARD, LEVEL, RULES, VIEW, createDeck, cardAtLevel, upgradeSummary, type CardDef } from './config';
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
  return `<button class="card ${selected?'chosen':''} ${c.kind==='income'?'economy-card':''} ${locked?'required-card':''}" data-card="${c.id}" aria-label="${c.name}，军饷 ${c.cost}${locked?'，固定携带':''}" aria-pressed="${selected}" ${locked?'aria-disabled="true"':''}>${imageFor(c.id,'card-art')}${c.kind==='income'?'<span class="card-purpose">产军饷</span>':''}<span class="card-cooldown" aria-hidden="true"></span><span class="card-info"><strong class="card-name">${c.name}</strong><span class="card-price">${coin}${c.cost}</span></span><span class="cooldown-time"></span><span class="card-check" aria-hidden="true">${locked?'固定':'✓'}</span></button>`;
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
  private incomeViews=new Map<number,HTMLElement>();
  constructor(private controller:UIController) {
    this.deckSelection=[...this.saved.deck];
    this.root=document.getElementById('ui')!;
    this.root.innerHTML=`
      <div class="battle-header"><div class="game-logo" role="img" aria-label="主公快跑，新野"></div><div class="topbar"><div class="chapter"><strong>新野 · 守城</strong><span id="wave-status"></span></div><div class="top-actions"><button class="paper-button sound-button" data-action="sound" aria-label="关闭声音" aria-pressed="true">${soundIcon()}</button><button class="paper-button pause-button" data-action="pause" aria-label="暂停"><i></i><i></i></button></div></div></div>
      <div id="toast" class="hidden" role="status"></div><div id="unit-detail"></div>
      <div id="boss-entry" role="status" hidden></div>
      <div id="boss-health" hidden><strong></strong><div><i></i></div><span></span></div>
      <div class="battle-bottom"><div class="motto motto-left">守住新野<br>护住主公<small>— 蜀军军令 —</small></div><div class="battle-tray"><div class="treasury"><span>${coin}</span><strong id="money">${RULES.money}</strong><small id="supply-left">待发${RULES.lordWaveSupply}</small></div><div id="deck-bar"></div><div class="emergency"><button class="skill skill-shield" data-action="shield" aria-label="护驾"><i></i><strong>护驾</strong></button></div></div><div class="motto motto-right">人在城在<br>主公无恙<small>— 新野营帐 —</small></div></div>
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
  paintIncome(incomes:Array<{uid:number;value:number;x:number;y:number;progress:number}>){
    const live=new Set(incomes.map(income=>income.uid));
    for(const [uid,view] of this.incomeViews)if(!live.has(uid)){view.remove();this.incomeViews.delete(uid);}
    if(!incomes.length)return;
    const bounds=this.root.querySelector('.treasury .coin')!.getBoundingClientRect();
    const target=stageCoordinates(document.getElementById('stage')!)(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
    for(const income of incomes){
      let view=this.incomeViews.get(income.uid);
      if(!view){
        view=document.createElement('div');view.className='income-flight';view.setAttribute('aria-hidden','true');
        view.innerHTML=`${coin}<strong>+${income.value}</strong>`;this.root.append(view);this.incomeViews.set(income.uid,view);
      }
      const t=income.progress,ease=t*t;
      const x=income.x+(target.x-income.x)*ease,y=income.y+(target.y-income.y)*ease-Math.sin(t*Math.PI)*VIEW.income.arc;
      view.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) scale(${1-t*.35})`;
      view.style.opacity=String(1-Math.pow(t,4));
    }
  }
  private setDetail(html:string){if(this.detailMarkup!==html){this.detailMarkup=html;this.root.querySelector('#unit-detail')!.innerHTML=html;}}
  private click(event:MouseEvent) {
    const target=(event.target as Element).closest<HTMLButtonElement>('button');if(!target||target.disabled)return;
    if(target.dataset.card){
      const id=target.dataset.card;
      if(this.controller.battle.phase==='select'){
        if(!LEVEL.loadout.heroes.includes(id))return;
        this.deckSelection=createDeck([id]);
        this.selection();
      }
      return;
    }
    const action=target.dataset.action;if(!action)return;
    if(action==='start'){
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
    const choices=(ids:string[],fixed:boolean)=>ids.map(id=>{const c=CARD[id];return `<div class="selection-choice ${fixed?'fixed-choice':'hero-choice'}">${cardMarkup(c,this.deckSelection.includes(id),fixed)}<span>${c.tip}</span></div>`;}).join('');
    this.modal.innerHTML=`<section class="selection panel" aria-label="布防选卡"><header class="panel-heading"><div><span class="faction-seal">蜀</span><h1>新野布防</h1></div><strong class="loadout-count" role="status"><span>出战</span><b>${this.deckSelection.length}<em>张</em></b></strong></header><div class="selection-cards"><h2 class="selection-label">选择一位武将</h2>${choices(LEVEL.loadout.heroes,false)}<h2 class="selection-label">随军器械 · 固定携带</h2>${choices(LEVEL.loadout.fixedCards,true)}</div><footer class="selection-footer"><small>器械杀敌升级 · 拒马拦截助攻成长 · 保护军饷库<br>开局${RULES.money} · 每关补给${RULES.lordWaveSupply}，清场补齐<br>共${LEVEL.waves.length}关 · 第${LEVEL.entries.B.wave}关城门开放 · 最后${LEVEL.waves.at(-1)?.name}三层来敌</small><div class="selection-actions">${button('start','开始布防',true)}</div></footer></section>`;
    this.modal.querySelector('.selection-cards')!.scrollTop=scrollTop;
  }
  private pausePanel() {
    this.modal.className='visible';
    this.modal.innerHTML=`<section class="pause panel"><span class="faction-seal">蜀</span><h1>${this.pauseConfirm?'重新布防？':'稍事休整'}</h1><p>${this.pauseConfirm?'本局进度将清空，返回选卡。':'战斗已暂停'}</p><div class="modal-actions">${button(this.pauseConfirm?'confirm-restart':'resume',this.pauseConfirm?'确认重开':'继续守城',true)}${button(this.pauseConfirm?'resume':'restart',this.pauseConfirm?'返回战斗':'重新开始')}</div></section>`;
  }
  private settlement() {
    const b=this.controller.battle,won=b.phase==='won';
    const exit=b.escapedVia?LEVEL.entries[b.escapedVia]:undefined;
    if(won){this.saved.cleared=true;this.saved.gold ||=b.perfect;saveProgress(this.saved);}
    this.modal.className='visible';
    this.modal.innerHTML=`<section class="settlement panel"><span class="faction-seal ${b.perfect?'gold-seal':''}">${b.perfect?'金':'蜀'}</span><h1>${won?(b.perfect?'金印 · 主公未被抓':'守住了'):'主公被掳走了'}</h1><p>${won?`${LEVEL.waves.length}关曹军已退，新野守住了。`:`刘备被${escapeText(b.loser)}带出${exit?`${exit.floor+1}层${exit.name}`:''}撤离口。`}</p><div class="battle-record">${[['被抓',b.stats.captures],['解救',b.stats.rescues],['机关损失',b.stats.losses],['消灭',b.stats.kills],['用时',`${Math.floor(b.stats.time/60)}分${Math.floor(b.stats.time%60)}秒`]].map(([label,value])=>`<span>${label}<strong>${value}</strong></span>`).join('')}</div><div class="modal-actions">${button('retry','原阵容重试',true)}${button('change','换阵再战')}</div></section>`;
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
    money.setAttribute('aria-label',`军饷 ${balance}`);
    this.root.querySelector('#supply-left')!.textContent=b.phase==='rest'?`下波${RULES.lordWaveSupply}`:b.active?(b.lordSupply>0?`待发${b.lordSupply}`:'补给已齐'):'军饷';
    const currentWave=Math.max(1,b.wave),waveName=LEVEL.waves[currentWave-1]?.name;
    this.root.querySelector('#wave-status')!.textContent=b.phase==='prepare'?`布防 ${Math.ceil(b.countdown)} 秒`:b.phase==='rest'?`整备 ${Math.ceil(b.countdown)} 秒`:waveName?`${waveName} · ${currentWave}/${LEVEL.waves.length}`:`第 ${currentWave} / ${LEVEL.waves.length} 关`;
    const boss=b.enemies.find(e=>e.def.boss&&e.hp>0),bossHealth=this.root.querySelector<HTMLElement>('#boss-health')!,bossEntry=this.root.querySelector<HTMLElement>('#boss-entry')!;
    const arrival=b.effects.find(e=>e.kind==='boss');
    bossHealth.hidden=!boss||!b.active;bossEntry.hidden=!boss||!arrival||!b.active;
    if(boss){
      bossHealth.querySelector('strong')!.textContent=`${boss.def.name} · ${boss.def.title??''}`;
      bossHealth.querySelector('i')!.style.width=`${Math.max(0,boss.hp/boss.def.hp*100)}%`;
      bossHealth.querySelector('span')!.textContent=`${Math.ceil(boss.hp)} / ${boss.def.hp}`;
      if(arrival){
        if(bossEntry.dataset.uid!==String(arrival.uid)){bossEntry.dataset.uid=String(arrival.uid);bossEntry.innerHTML=`${imageFor(boss.def.id)}<div><small>${escapeText(waveName??'强敌来袭')} · ${escapeText(boss.def.title??'')}</small><strong>${escapeText(boss.def.name)}</strong><span>${escapeText(boss.def.line??'')}</span></div>`;}
        bossEntry.style.opacity=String(Math.min(1,arrival.life/(arrival.maxLife*.2)));
      }
    }
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
      const def=selected.def,refund=b.refund(selected),unavailable=!b.active||b.paused;
      const durability=def.destructible?`${def.mobile?'生命':'耐久'} ${Math.ceil(selected.hp)} / ${def.hp}`:'不可摧毁';
      const supply=def.income?`<span>累计产出 ${selected.incomePaid} · 累计投入 ${selected.invested}</span>`:'';
      const piercing=def.pierce?`<span>每${def.interval}秒一箭 · 每次贯穿后保留${Math.round((def.pierceFalloff??1)*100)}%伤害</span>`:'';
      const next=def.upgrades?.[selected.level];
      const upgrade=next?`<div class="unit-upgrade"><span>${def.kind==='barricade'?'拦截助攻':'击杀'} ${selected.kills} / ${next.kills} · 自动升至 ${selected.level+2} 级</span><small>${upgradeSummary(def,cardAtLevel(def.id,selected.level+1))}</small></div>`:def.upgrades?`<span class="upgrade-complete">已满级 · 累计${def.kind==='barricade'?'助攻':'击杀'} ${selected.kills}</span>`:'';
      this.setDetail(`${imageFor(def.id)}<div class="unit-description"><strong>${def.name}${def.upgrades?` · ${selected.level+1}级`:''}</strong><span>${durability}</span><span>${def.tip}</span>${supply}${piercing}${upgrade}</div><div class="unit-actions">${def.manual?button('activate',selected.ready>0?'布设中':selected.cooldown>0?`装填 ${Math.ceil(selected.cooldown)}秒`:'发动',true,unavailable||selected.cooldown>0||selected.ready>0,selected.uid):''}${def.kind==='log'&&b.time-selected.born<RULES.faceWindow?button('turn',selected.facing<0?'朝左 ←':'朝右 →',false,unavailable,selected.uid):''}${button('sell',`${def.mobile?'撤回':'拆除'} +${refund}`,false,unavailable,selected.uid)}</div><button class="detail-close" data-action="deselect" aria-label="关闭详情">×</button>`);
    }else if(this.controller.selectedCard){this.unitChoices=[];this.setDetail('');}
    else{
      const choices=b.units.filter(u=>u.hp>0&&this.unitChoices.includes(u.uid));this.unitChoices=choices.map(u=>u.uid);
      this.setDetail(choices.length?`<div class="stack-choice">${choices.map(u=>`<button data-action="select" data-uid="${u.uid}">${imageFor(u.def.id)}<strong>${u.def.name}</strong></button>`).join('')}</div>`:'');
    }
  }
  reset(){this.lastPhase='';this.setDetail('');this.hideDrag();this.paintIncome([]);this.unitChoices=[];this.pauseConfirm=false;this.update();}
}
