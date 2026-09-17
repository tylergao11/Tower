import { CARD, CARDS, ENEMIES, LEVEL, RULES, VIEW, type CardDef } from './config';
import type { Battle } from './game/Battle';
import { loadSave, saveProgress } from './platform';
import { previewFor } from './render/art';

export interface UIController {
  battle:Battle; selectedCard?:string; selectedUnit?:number;
  start(deck:string[]):void; restart(select:boolean):void;
  action(type:string,uid?:number):void; toggleSound():void;
}
const surfaces:Record<string,string>={ground:'地面',wall:'墙面',ceiling:'顶部'};
function artStyle(id:string) {
  return `background-image:url('${previewFor(id)}');background-size:contain;background-position:center;`;
}
function icon(name:string) {return `<img class="ui-icon" src="${previewFor('UI-ICONS/'+name)}" alt="">`;}
function cardMarkup(c:CardDef,selected=false) {
  const style=artStyle(c.id);
  return `<button class="card ${selected?'chosen':''}" data-card="${c.id}" aria-label="${c.name}"><span class="card-art" style="${style}"></span><span class="card-name">${c.name}</span><span class="card-price">${icon('coin')} ${c.cost}</span><span class="card-cooldown"></span></button>`;
}

export class UI {
  private root:HTMLElement;
  private modal:HTMLElement;
  private hud:HTMLElement;
  private deck:HTMLElement;
  private detail:HTMLElement;
  private lastPhase='';
  private deckSelection:string[];
  private saved=loadSave();
  private selectedDescription='';
  private pauseConfirm=false;
  private unitChoices:number[]=[];
  private detailMarkup='';
  private dragPreview:HTMLDivElement;
  private dragId='';
  constructor(private controller:UIController) {
    this.deckSelection=this.saved.deck.filter(id=>CARD[id]);
    if(this.deckSelection.length!==LEVEL.deckSize)this.deckSelection=[...LEVEL.defaultDeck];
    this.root=document.getElementById('ui')!;
    this.root.innerHTML=`<div class="topbar"><div class="level-name">${LEVEL.name}<small>守住主公</small></div><div class="status"><span id="money"></span><span id="wave"></span><span id="count"></span></div><div class="top-actions"><button data-action="sound" aria-label="声音">声</button><button data-action="pause" aria-label="暂停">Ⅱ</button></div></div><div id="entry-labels"></div><div id="toast" role="status"></div><div id="unit-detail"></div><div id="deck-bar"></div><div class="emergency"><button data-action="shield">护驾 <small>1</small></button><button data-action="recall">回营 <small>1</small></button></div><div id="modal"></div>`;
    this.modal=this.root.querySelector('#modal')!;this.hud=this.root.querySelector('.topbar')!;this.deck=this.root.querySelector('#deck-bar')!;this.detail=this.root.querySelector('#unit-detail')!;
    this.dragPreview=document.createElement('div');this.dragPreview.id='drag-preview';this.dragPreview.hidden=true;
    this.dragPreview.style.width=this.dragPreview.style.height=`${VIEW.input.previewSize}px`;
    this.dragPreview.setAttribute('aria-hidden','true');this.root.append(this.dragPreview);
    this.root.querySelector('[data-action="pause"]')!.innerHTML=icon('pause');
    for(const [action,sprite] of [['shield','protect'],['recall','return']])this.root.querySelector(`[data-action="${action}"]`)!.insertAdjacentHTML('afterbegin',icon(sprite));
    this.root.addEventListener('click',event=>this.click(event));
    this.update();
  }
  showDrag(id:string,x:number,y:number,valid:boolean){
    if(this.dragId!==id){this.dragId=id;this.dragPreview.style.backgroundImage=`url("${previewFor(id)}")`;}
    this.dragPreview.hidden=false;this.dragPreview.style.left=`${x}px`;this.dragPreview.style.top=`${y}px`;
    this.dragPreview.classList.toggle('valid',valid);this.root.classList.add('dragging');
  }
  hideDrag(){this.dragPreview.hidden=true;this.root.classList.remove('dragging');}
  private setDetail(html:string){if(this.detailMarkup!==html){this.detailMarkup=html;this.detail.innerHTML=html;}}
  private click(event:MouseEvent) {
    const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
    if(target.dataset.card){
      const id=target.dataset.card;
      if(this.controller.battle.phase==='select'){
        if(this.deckSelection.includes(id))this.deckSelection=this.deckSelection.filter(c=>c!==id);
        else if(this.deckSelection.length<LEVEL.deckSize)this.deckSelection.push(id);
        this.selectedDescription=CARD[id].tip;this.selection();
      }
      return;
    }
    const action=target.dataset.action;if(!action)return;
    if(action==='start'){
      if(this.deckSelection.length!==LEVEL.deckSize)return;
      this.saved.deck=[...this.deckSelection];saveProgress(this.saved);this.controller.start(this.deckSelection);
    }else if(action==='restart'){this.pauseConfirm=true;this.pausePanel();}
    else if(action==='confirm-restart'){this.pauseConfirm=false;this.controller.restart(true);}
    else if(action==='resume'){this.pauseConfirm=false;this.controller.battle.paused=false;}
    else if(action==='retry')this.controller.restart(false);
    else if(action==='change')this.controller.restart(true);
    else if(action==='sound'){this.controller.toggleSound();target.classList.toggle('muted');}
    else this.controller.action(action,target.dataset.uid?Number(target.dataset.uid):undefined);
    this.update();
  }
  private selection() {
    this.modal.className='visible';
    const warnings=[];
    if(!this.deckSelection.some(id=>['ballista','hook','hammer'].includes(CARD[id].kind)))warnings.push('缺少攀顶对策');
    if(!this.deckSelection.includes('G04'))warnings.push('未带军需账房');
    if(!this.deckSelection.some(id=>CARD[id].manual))warnings.push('未带手动机关');
    this.modal.innerHTML=`<section class="selection panel"><header><div><small>布防</small><h1>${LEVEL.name}</h1></div><span>携带 ${this.deckSelection.length} / ${LEVEL.deckSize}</span></header><div class="selection-cards">${CARDS.map(c=>cardMarkup(c,this.deckSelection.includes(c.id))).join('')}</div><div class="selection-footer"><p>${this.selectedDescription||'选好机关与守军，准备迎敌'}<small>${warnings.join(' · ')}</small></p><button class="primary" data-action="start" ${this.deckSelection.length!==LEVEL.deckSize?'disabled':''}>开始布防</button></div><details class="enemy-guide"><summary>敌军情报</summary><div>${ENEMIES.map(e=>`<span><b>${e.name}</b>${e.climb?'攀顶':e.engineer?'拆机关':e.ranged?'远程':e.shield?'持盾':e.heavy?'重甲':'近战'}</span>`).join('')}</div></details></section>`;
  }
  private pausePanel() {
    this.modal.className='visible';
    this.modal.innerHTML=`<section class="pause panel"><h1>${this.pauseConfirm?'重新开始？':'已暂停'}</h1>${this.pauseConfirm?'<p>本局进度将清空</p>':''}<button class="primary" data-action="${this.pauseConfirm?'confirm-restart':'resume'}">${this.pauseConfirm?'重新开始':'继续'}</button><button data-action="${this.pauseConfirm?'resume':'restart'}">${this.pauseConfirm?'返回战斗':'重新开始'}</button></section>`;
  }
  private settlement() {
    const b=this.controller.battle,won=b.phase==='won';
    if(won){this.saved.cleared=true;this.saved.gold ||=b.perfect;saveProgress(this.saved);}
    this.modal.className='visible';
    const minutes=Math.floor(b.stats.time/60),seconds=Math.floor(b.stats.time%60).toString().padStart(2,'0');
    this.modal.innerHTML=`<section class="settlement panel"><small>${LEVEL.name}</small><h1>${won?'守住了':'主公被掳走了'}</h1>${b.perfect?'<div class="gold-seal">金印 · 主公未被抓</div>':`<p>${won?'主公平安':`${b.loser}从城外带走了主公`}</p>`}<div class="results"><span>被抓<b>${b.stats.captures}</b></span><span>解救<b>${b.stats.rescues}</b></span><span>机关损失<b>${b.stats.losses}</b></span><span>消灭<b>${b.stats.kills}</b></span><span>用时<b>${minutes}:${seconds}</b></span></div><button class="primary" data-action="retry">原阵容重试</button><button data-action="change">换阵再战</button></section>`;
    this.modal.querySelector('.gold-seal')?.insertAdjacentHTML('afterbegin',icon('gold-seal'));
  }
  chooseUnits(units:Array<{uid:number;def:CardDef}>) {
    this.unitChoices=units.map(u=>u.uid);this.update();
  }
  update() {
    const b=this.controller.battle;
    const phase=b.paused?'paused':b.phase;
    if(phase!==this.lastPhase){
      this.lastPhase=phase;
      if(phase==='select')this.selection();
      else if(phase==='paused')this.pausePanel();
      else if(phase==='won'||phase==='lost')this.settlement();
      else {this.modal.className='';this.modal.innerHTML='';}
      if(b.active&&this.deck.dataset.deck!==b.deck.join(',')){this.deck.dataset.deck=b.deck.join(',');this.deck.innerHTML=b.deck.map(id=>cardMarkup(CARD[id])).join('');}
    }
    this.hud.classList.toggle('hidden',b.phase==='select');this.deck.classList.toggle('hidden',b.phase==='select');
    this.root.querySelector('.emergency')!.classList.toggle('hidden',b.phase==='select');
    this.root.querySelector('#money')!.textContent=`军饷 ${Math.floor(b.money)}`;
    this.root.querySelector('#wave')!.textContent=b.phase==='prepare'?`布防 ${Math.ceil(b.countdown)}`:b.phase==='rest'?`整备 ${Math.ceil(b.countdown)}`:`第 ${b.wave} / ${LEVEL.waves.length} 波`;
    this.root.querySelector('#count')!.textContent=`在场 ${b.enemies.filter(e=>e.hp>0).length} · 待出 ${b.remaining}`;
    const toast=this.root.querySelector('#toast')!;toast.textContent=b.time<b.messageUntil?b.message:'';
    for(const button of this.deck.querySelectorAll<HTMLElement>('[data-card]')){
      const id=button.dataset.card!,def=CARD[id],cd=b.cooldowns[id]||0;
      button.classList.toggle('chosen',this.controller.selectedCard===id);
      button.classList.toggle('unavailable',b.money<def.cost||cd>0);
      const cool=button.querySelector<HTMLElement>('.card-cooldown')!;
      cool.style.height=`${cd/def.cooldown*100}%`;cool.textContent=cd>0?String(Math.ceil(cd)):'';
    }
    for(const key of ['shield','recall'] as const){
      const button=this.root.querySelector<HTMLButtonElement>(`[data-action="${key}"]`)!;
      const count=key==='shield'?b.shieldUses:b.recallUses;
      button.querySelector('small')!.textContent=String(count);
      button.disabled=!count||!b.active||b.paused||(key==='recall'?b.lord.state!=='dropped':!['idle','grabbing'].includes(b.lord.state)||b.lord.shield>0||b.lord.floor!==LEVEL.lord.floor||b.lord.x!==LEVEL.lord.x);
    }
    const selected=b.units.find(u=>u.uid===this.controller.selectedUnit);
    if(selected){
      this.unitChoices=[];
      const def=selected.def,refund=Math.floor(def.cost*RULES.refund*selected.hp/def.hp);
      const html=`<b>${def.name}</b><span>${Math.ceil(selected.hp)} / ${def.hp}</span>${def.manual?`<button data-action="activate" data-uid="${selected.uid}" ${selected.cooldown>0||selected.ready>0?'disabled':''}>${selected.cooldown>0?`装填 ${Math.ceil(selected.cooldown)}`:'发动'}</button>`:''}${def.mobile?'<small>拖动驻守</small>':''}${def.kind==='log'&&b.time-selected.born<RULES.faceWindow?`<button data-action="turn" data-uid="${selected.uid}">转向</button>`:''}<button data-action="sell" data-uid="${selected.uid}">${def.mobile?'撤回':'拆除'} +${refund}</button><button data-action="deselect">×</button>`;
      this.setDetail(html);
    }else if(this.controller.selectedCard){
      this.unitChoices=[];
      this.setDetail('');
    }else{
      const choices=b.units.filter(u=>u.hp>0&&this.unitChoices.includes(u.uid));
      this.unitChoices=choices.map(u=>u.uid);
      const html=choices.length?`<div class="stack-choice">${choices.map(u=>`<button data-action="select" data-uid="${u.uid}">${u.def.name}<small>${u.def.mobile?'守军':u.def.surfaces.map(s=>surfaces[s]).join('＋')}</small></button>`).join('')}</div>`:'';
      this.setDetail(html);
    }
  }
  reset(){this.lastPhase='';this.setDetail('');this.hideDrag();this.unitChoices=[];this.pauseConfirm=false;this.update();}
}
