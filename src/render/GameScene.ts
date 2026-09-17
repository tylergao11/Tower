import Phaser from 'phaser';
import { CARD, LEVEL, RULES, VIEW } from '../config';
import { Battle } from '../game/Battle';
import { lastColumn, position } from '../game/map';
import type { Action, Command } from '../game/types';
import { AudioPlayer } from '../platform';
import { UI, type UIController } from '../ui';
import { ActorView, installFrames, installPreviews, preloadArt, manifest } from './art';
import { LoadingScreen } from '../loading';
import { Opening } from './Opening';
import { ceilingY, floorPoint, routePoint, worldPoint } from './layout';

interface FieldGesture { pointerId:number;startX:number;startY:number;moved:boolean;card?:string;unit?:number }

export class GameScene extends Phaser.Scene implements UIController {
  battle=new Battle();
  selectedCard?:string;
  selectedUnit?:number;
  private dragUnit?:number;
  private gesture?:FieldGesture;
  private inputStage?:HTMLElement;
  private ui!:UI;
  private audioPlayer=new AudioPlayer();
  private units=new Map<number,ActorView>();
  private enemies=new Map<number,ActorView>();
  private lord!:ActorView;
  private lordState='';
  private lordStateSince=0;
  private graphics!:Phaser.GameObjects.Graphics;
  private marks!:Phaser.GameObjects.Graphics;
  private labels=new Map<string,Phaser.GameObjects.Text>();
  private accumulator=0;
  private uiTimer=0;
  private heard=0;
  private floors=new Map<string,Phaser.GameObjects.Image>();
  private floorEdges=new Map<string,Phaser.GameObjects.Image[]>();
  private scenery=new Map<string,ActorView>();
  private fx=new Map<string,ActorView>();
  private sprites=new Map<string,Phaser.GameObjects.Image>();
  private projectileOffsets=new Map<number,{x:number;y:number}>();
  private retiring=new Map<number,{view:ActorView;since:number;action:string}>();
  private point?:{floor:number;x:number};
  private opening?:Opening;
  constructor(){super('game');}

  preload(){
    LoadingScreen.assets(manifest.files);
    this.load.on('fileprogress',(file:Phaser.Loader.File,value:number)=>LoadingScreen.file(file.key,value));
    this.load.on('filecomplete',(key:string)=>LoadingScreen.file(key,1));
    this.load.on('loaderror',()=>LoadingScreen.fail('资源加载失败，请重试'));
    preloadArt(this);
  }
  create(){
    if(LoadingScreen.hasFailed)return;
    try{this.createWorld();}catch(error){LoadingScreen.fail('画面载入失败，请重试');console.error(error);}
  }
  private createWorld(){
    LoadingScreen.progress(.94,'准备画面');
    installFrames(this);
    installPreviews(this);
    LoadingScreen.progress(.98,'准备画面');
    this.add.image(0,VIEW.backgroundY,VIEW.background).setOrigin(0,0).setDisplaySize(VIEW.width,VIEW.height);
    this.drawSupports();
    this.graphics=this.add.graphics().setDepth(480);
    this.marks=this.add.graphics().setDepth(500);
    this.lord=new ActorView(this,'L01',VIEW.lordHeight);
    this.scenery.set('chair',new ActorView(this,'B05-chair',VIEW.lordHeight));
    this.scenery.set('gate',new ActorView(this,'B03-gate',VIEW.gateHeight));
    this.scenery.set('barrier',new ActorView(this,'B03-barrier',VIEW.gateHeight));
    this.scenery.set('camp-flag',new ActorView(this,'B-flag-green',VIEW.flagHeight));
    this.scenery.set('exit-flag',new ActorView(this,'B-flag-red',VIEW.flagHeight));
    this.ui=new UI(this);
    this.bindControls();
    const visibility=()=>{if(this.opening)this.opening.paused=document.hidden;if(document.hidden){this.cancelDrag();if(this.battle.active){this.battle.paused=true;this.ui.update();}}};
    const blur=()=>{this.cancelDrag();if(this.opening)this.opening.paused=true;if(this.battle.active){this.battle.paused=true;this.ui.update();}};
    const focus=()=>{if(this.opening)this.opening.paused=document.hidden;};
    const resize=()=>this.scale.updateBounds();
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);window.addEventListener('focus',focus);window.addEventListener('stage-resize',resize);
    document.addEventListener('pointerdown',()=>this.audioPlayer.unlock(),{once:true});
    this.events.once('shutdown',()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);window.removeEventListener('stage-resize',resize);this.opening?.destroy();});
    this.paint();
    document.getElementById('ui')!.style.visibility='hidden';
    this.opening=new Opening(this,()=>{this.opening=undefined;document.getElementById('ui')!.style.visibility='';this.ui.update();});
    LoadingScreen.finish();
  }

  start(deck:string[]){this.battle.start(deck);this.ui.update();}
  restart(select:boolean){
    this.cancelDrag();
    const deck=[...this.battle.deck];this.battle=new Battle();this.battle.deck=deck;
    this.selectedCard=undefined;this.selectedUnit=undefined;this.dragUnit=undefined;this.accumulator=0;this.heard=0;
    for(const view of this.units.values())view.destroy();for(const view of this.enemies.values())view.destroy();
    this.units.clear();this.enemies.clear();this.labels.forEach(t=>t.destroy());this.labels.clear();
    for(const item of this.retiring.values())item.view.destroy();this.retiring.clear();
    for(const view of this.fx.values())view.destroy();this.fx.clear();for(const image of this.sprites.values())image.destroy();this.sprites.clear();
    this.projectileOffsets.clear();
    if(!select)this.battle.start(deck);this.ui.reset();
  }
  toggleSound(){this.audioPlayer.enabled=!this.audioPlayer.enabled;this.audioPlayer.unlock();}
  action(type:string,uid?:number){
    if(type==='pause'){this.cancelDrag();if(this.battle.active)this.battle.paused=true;}
    else if(type==='deselect'){this.cancelDrag();this.selectedUnit=undefined;}
    else if(type==='select'){this.cancelDrag();this.selectedUnit=uid;}
    else if(type==='shield'||type==='recall')this.battle.command({type});
    else if(uid!==undefined&&['activate','sell','turn'].includes(type)){this.battle.command({type,uid} as Command);if(type==='sell')this.selectedUnit=undefined;}
    this.ui.update();
  }
  update(_time:number,delta:number){
    if(!this.ui)return;
    if(this.opening){this.opening.update(Math.min(delta/1000,RULES.maxFrameSeconds));return;}
    if(this.gesture&&(!this.battle.active||this.battle.paused||(this.dragUnit!==undefined&&!this.battle.units.some(u=>u.uid===this.dragUnit&&u.hp>0))))this.cancelDrag();
    this.accumulator+=Math.min(delta/1000,RULES.maxFrameSeconds);
    while(this.accumulator>=RULES.step){this.battle.step(RULES.step);this.accumulator-=RULES.step;}
    this.paint();this.uiTimer+=delta/1000;
    if(this.uiTimer>=VIEW.uiInterval){this.uiTimer=0;this.ui.update();}
    for(const effect of this.battle.effects)if(effect.uid>this.heard){this.audioPlayer.play(effect.kind);this.heard=effect.uid;}
  }

  private screen(floor:number,x:number){return floorPoint(floor,x);}
  private slotPoint(floor:number,x:number,card?:string){
    const p=this.screen(floor,x),def=card?CARD[card]:undefined;
    const lift=def?.surfaces.includes('ceiling')?p.y-ceilingY(floor):def?.surfaces.length===1&&def.surfaces[0]==='wall'?VIEW.wallLift:0;
    return {x:p.x,y:p.y-lift-12};
  }
  private fieldPoint(x:number,y:number,card?:string){
    let floor=0;
    for(let f=1;f<LEVEL.floors;f++)if(Math.abs(y-this.slotPoint(f,0,card).y)<Math.abs(y-this.slotPoint(floor,0,card).y))floor=f;
    return {floor,x:Math.max(0,Math.min(lastColumn,Math.round((x-VIEW.x0)/(VIEW.x1-VIEW.x0)*lastColumn)))};
  }
  private insideField(x:number,y:number){
    const halfCell=(VIEW.x1-VIEW.x0)/lastColumn/2;
    return x>=VIEW.x0-halfCell&&x<=VIEW.x1+halfCell&&y>=VIEW.input.fieldTop&&y<=VIEW.input.fieldBottom;
  }
  private pointerPoint(event:PointerEvent){
    const rect=this.inputStage!.getBoundingClientRect();
    return {x:(event.clientX-rect.left)/rect.width*VIEW.width,y:(event.clientY-rect.top)/rect.height*VIEW.height};
  }
  private bagsAt(x:number,y:number){
    return this.battle.bags.filter(bag=>{
      const bounds=this.sprites.get('bag-'+bag.uid)?.getBounds(),pad=VIEW.input.bagPadding;
      return bounds&&x>=bounds.left-pad&&x<=bounds.right+pad&&y>=bounds.top-pad&&y<=bounds.bottom+pad;
    });
  }
  private bindControls(){
    const stage=this.inputStage=document.getElementById('stage')!;
    const down=(event:PointerEvent)=>{
      if(this.gesture||!event.isPrimary||event.button!==0||this.opening||!this.battle.active||this.battle.paused)return;
      const target=event.target instanceof Element?event.target:undefined;
      const card=target?.closest<HTMLElement>('#deck-bar [data-card]')?.dataset.card;
      if(!card&&target!==this.game.canvas)return;
      const p=this.pointerPoint(event);
      if(!card&&!this.insideField(p.x,p.y))return;
      const unit=!card&&!this.bagsAt(p.x,p.y).length?this.battle.units.find(u=>u.def.mobile&&u.hp>0&&this.units.get(u.uid)?.bounds.contains(p.x,p.y)):undefined;
      this.gesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,card,unit:unit?.uid};
      this.selectedCard=card;this.dragUnit=unit?.uid;
      if(card)this.selectedUnit=undefined;else if(unit)this.selectedUnit=unit.uid;
      stage.setPointerCapture(event.pointerId);event.preventDefault();this.audioPlayer.unlock();
      this.previewDrag(p.x,p.y);this.ui.update();
    };
    const move=(event:PointerEvent)=>{
      const drag=this.gesture;if(!drag||event.pointerId!==drag.pointerId)return;
      drag.moved ||= Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>=VIEW.input.dragThreshold;
      const p=this.pointerPoint(event);this.previewDrag(p.x,p.y);event.preventDefault();
    };
    const up=(event:PointerEvent)=>{
      const drag=this.gesture;if(!drag||event.pointerId!==drag.pointerId)return;
      drag.moved ||= Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>=VIEW.input.dragThreshold;
      const p=this.pointerPoint(event),target=document.elementFromPoint(event.clientX,event.clientY);
      const inField=this.insideField(p.x,p.y)&&target===this.game.canvas;
      if(this.battle.active&&!this.battle.paused&&inField){
        if(drag.moved&&drag.card){const slot=this.fieldPoint(p.x,p.y,drag.card);this.battle.command({type:'deploy',card:drag.card,...slot,facing:slot.floor%2?1:-1});}
        else if(drag.moved&&drag.unit){
          const slot=this.fieldPoint(p.x,p.y),error=this.battle.rallyError(drag.unit,slot.floor,slot.x);
          if(error)this.battle.tell(error);else this.battle.command({type:'rally',uid:drag.unit,x:slot.x});
        }else if(!drag.card&&!drag.moved)this.clickField(p.x,p.y);
      }
      this.cancelDrag();this.ui.update();
    };
    const cancel=(event:PointerEvent)=>{if(event.pointerId===this.gesture?.pointerId)this.cancelDrag();};
    stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move);
    stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',cancel);stage.addEventListener('lostpointercapture',cancel);
    this.events.once('shutdown',()=>{
      this.cancelDrag();stage.removeEventListener('pointerdown',down);stage.removeEventListener('pointermove',move);
      stage.removeEventListener('pointerup',up);stage.removeEventListener('pointercancel',cancel);stage.removeEventListener('lostpointercapture',cancel);
    });
  }
  private previewDrag(x:number,y:number){
    const card=this.selectedCard,unit=this.battle.units.find(u=>u.uid===this.dragUnit),id=card||unit?.def.id;
    if(!id)return;
    this.point=this.insideField(x,y)?this.fieldPoint(x,y,card):undefined;
    const valid=!!this.point&&!(card?this.battle.placementError(card,this.point.floor,this.point.x):this.battle.rallyError(unit!.uid,this.point.floor,this.point.x));
    this.ui.showDrag(id,x,y,valid);
  }
  private cancelDrag(){
    const pointer=this.gesture?.pointerId;this.gesture=undefined;
    if(pointer!==undefined&&this.inputStage?.hasPointerCapture(pointer))this.inputStage.releasePointerCapture(pointer);
    this.selectedCard=undefined;this.dragUnit=undefined;this.point=undefined;
    this.ui?.hideDrag();this.marks?.clear();
  }
  private clickField(x:number,y:number){
    const b=this.battle;if(!b.active||b.paused||!this.insideField(x,y))return;
    const bags=this.bagsAt(x,y);if(bags.length){for(const bag of bags)b.command({type:'collect',uid:bag.uid});return;}
    const picked=b.units.filter(u=>this.units.get(u.uid)?.bounds.contains(x,y));
    if(picked.length>1){this.selectedUnit=undefined;this.ui.chooseUnits(picked);return;}
    if(picked.length){this.selectedUnit=picked[0].uid;this.ui.update();return;}
    const enemy=b.enemies.filter(e=>e.hp>0).find(e=>this.enemies.get(e.uid)?.bounds.contains(x,y));
    if(enemy){b.command({type:'focus',uid:enemy.uid});return;}
    this.selectedUnit=undefined;this.ui.reset();
  }

  private enemyScreen(uid:number){
    const e=this.battle.enemies.find(e=>e.uid===uid);if(!e)return undefined;
    const p=position(e.q),v=routePoint(e.q);
    if(e.drop){const from=this.screen(e.drop.fromFloor,p.x).y,to=this.screen(e.drop.toFloor,p.x).y;v.y=Phaser.Math.Linear(from,to,Math.min(1,e.drop.elapsed/RULES.dropTime));}
    return v;
  }

  private drawSupports(){
    const art=manifest.scene;
    const add=(sprite:string,x:number,y:number,w:number,h:number,depth:number)=>{
      const s=manifest.sprites[sprite];return this.add.image(x,y,s.atlas,sprite).setOrigin(.5,0).setDisplaySize(w,h).setDepth(depth);
    };
    const cell=(VIEW.x1-VIEW.x0)/lastColumn;
    for(let floor=1;floor<LEVEL.floors;floor++)for(let col=0;col<LEVEL.columns;col++){
      const p=this.screen(floor,col);
      const key=`${floor}:${col}`;
      this.floors.set(key,add(art.floorModule,p.x,p.y-5,cell+3,VIEW.platformHeight,90+floor*100));
      const hatch=manifest.objects.G07,frame=hatch.nodes.base;
      const opening=frame.width/hatch.canvas[1]*VIEW.deviceHeight,edgeWidth=(cell-opening)/2+2;
      this.floorEdges.set(key,[-1,1].map(side=>add(art.floorModule,p.x+side*(opening+edgeWidth)/2,p.y-5,edgeWidth,VIEW.platformHeight,90+floor*100).setVisible(false)));
    }
    for(const stair of Object.values(art.stairs)){
      const [x,y,w,h]=stair.rect;
      add(stair.sprite,(x+w/2)/art.canvas[0]*VIEW.width,y/art.canvas[1]*VIEW.height+VIEW.backgroundY,w/art.canvas[0]*VIEW.width,h/art.canvas[1]*VIEW.height,80);
    }
    const y=VIEW.topBeamY;
    for(let col=1;col<lastColumn;col++){
      const p=this.screen(2,col);add(art.beam,p.x,y,cell+5,VIEW.beamHeight,10);
    }
    for(const col of [1,lastColumn-1]){const p=this.screen(2,col);add(art.post,p.x,y,24,VIEW.floorY[2]-y,9);}
  }

  private label(key:string,text:string,x:number,y:number,size=20,color='#ffebbe'){
    let label=this.labels.get(key);
    if(!label){label=this.add.text(x,y,text,{fontFamily:'Microsoft YaHei, sans-serif',fontSize:size,color,stroke:'#1b2320',strokeThickness:4}).setOrigin(.5).setDepth(520);this.labels.set(key,label);}
    label.setText(text).setPosition(x,y).setVisible(!!text);return label;
  }
  private health(x:number,y:number,value:number,max:number,color:number,width=63){
    const g=this.graphics;g.fillStyle(0x151c18,.9);g.fillRoundedRect(x-width/2-2,y-2,width+4,10,3);
    g.fillStyle(color,1);g.fillRect(x-width/2,y,width*Math.max(0,value/max),6);
  }

  private paint(){
    const b=this.battle,g=this.graphics,m=this.marks;g.clear();m.clear();
    for(const [key,image] of this.floors){const [floor,x]=key.split(':').map(Number),hatch=b.units.some(u=>u.def.kind==='hatch'&&u.floor===floor&&u.x===x);image.setVisible(!hatch);this.floorEdges.get(key)?.forEach(edge=>edge.setVisible(hatch));}
    const usedLabels=new Set<string>();
    const usedFx=new Set<string>(),usedSprites=new Set<string>();
    const fx=(key:string,id:string,x:number,y:number,size:number,action='idle',progress?:number)=>{
      usedFx.add(key);let view=this.fx.get(key);if(!view){view=new ActorView(this,id,size);this.fx.set(key,view);}
      view.root.setPosition(x,y).setDepth(470);view.update(action,b.time,1,0,{progress});return view;
    };
    const sprite=(key:string,frame:string,x:number,y:number,w:number,h:number)=>{
      usedSprites.add(key);let image=this.sprites.get(key);const sp=manifest.sprites[frame];
      if(!image){image=this.add.image(x,y,sp.atlas,frame).setDepth(475);this.sprites.set(key,image);}
      image.setTexture(sp.atlas,frame).setPosition(x,y).setDisplaySize(w,h);return image;
    };
    const label=(key:string,text:string,x:number,y:number,size?:number,color?:string)=>{usedLabels.add(key);return this.label(key,text,x,y,size,color);};
    const camp=this.screen(LEVEL.lord.floor,LEVEL.lord.x),chair=this.scenery.get('chair')!;
    chair.root.setPosition(camp.x,camp.y).setDepth(305);chair.update('idle',b.time,1);
    for(const [id,floor,x] of [['camp-flag',LEVEL.lord.floor,LEVEL.lord.x-.55],['exit-flag',0,-.3]] as const){const view=this.scenery.get(id)!,p=this.screen(floor,x);view.root.setPosition(p.x,p.y).setDepth(95+floor*100);view.update('idle',b.time,1);}
    for(const [id,entryKey] of [['gate','B'],['barrier','C']] as const){const entry=LEVEL.entries[entryKey],p=this.screen(entry.floor,entry.x),view=this.scenery.get(id)!;
      view.root.setPosition(p.x,p.y).setDepth(85);view.update(b.wave>=entry.wave?'open':'idle',b.time,1,0,{progress:b.wave>entry.wave?1:b.wave===entry.wave?Math.min(1,b.waveTime/RULES.entryWarning):0});}
    const draggingUnit=b.units.find(u=>u.uid===this.dragUnit);
    if((this.selectedCard||draggingUnit)&&b.active&&!b.paused){
      for(let floor=0;floor<LEVEL.floors;floor++)for(let col=0;col<LEVEL.columns;col++){
        const error=this.selectedCard?b.placementError(this.selectedCard,floor,col):b.rallyError(draggingUnit!.uid,floor,col);
        if(error)continue;
        const p=this.slotPoint(floor,col,this.selectedCard);
        m.lineStyle(2,VIEW.colors.gold,.8);m.fillStyle(VIEW.colors.gold,.16);
        m.fillRoundedRect(p.x-53,p.y-20,106,40,6);m.strokeRoundedRect(p.x-53,p.y-20,106,40,6);
      }
      if(this.point){
        const p=this.slotPoint(this.point.floor,this.point.x,this.selectedCard);
        const error=this.selectedCard?b.placementError(this.selectedCard,this.point.floor,this.point.x):b.rallyError(draggingUnit!.uid,this.point.floor,this.point.x);
        m.lineStyle(3,error?VIEW.colors.red:VIEW.colors.gold,.9);m.strokeEllipse(p.x,p.y,108,28);
      }
    }
    const unitIds=new Set(b.units.map(u=>u.uid));
    for(const [uid,view] of this.units)if(!unitIds.has(uid)){this.retiring.set(uid,{view,since:b.time,action:view.hasAction('destroy')?'destroy':'dead'});this.units.delete(uid);}
    for(const [uid,item] of this.retiring){const progress=(b.time-item.since)/VIEW.destroyDuration;
      if(progress>=1){item.view.destroy();this.retiring.delete(uid);}else{item.view.update(item.action,b.time,item.view.root.scaleX<0?-1:1,0,{progress});item.view.root.setAlpha(1-progress);}}
    for(const u of b.units){
      let view=this.units.get(u.uid);if(!view){view=new ActorView(this,u.def.id,u.def.mobile?VIEW.actorHeight:VIEW.deviceHeight);this.units.set(u.uid,view);}
      const p=this.screen(u.floor,u.x),ceiling=u.def.surfaces.includes('ceiling');
      let lift=u.def.surfaces.length===1&&u.def.surfaces[0]==='wall'?VIEW.wallLift:0;
      view.root.setPosition(p.x,p.y-lift).setDepth(100+u.floor*100+(ceiling?0:10)).setAlpha(u.ready>0?.45:1);
      const unitAction=u.ready>0?'deploy':u.hit>0?'hit':u.openUntil>b.time?'open':u.action==='attack'&&!u.def.mobile?'activate':u.def.kind==='income'?(b.bags.some(bag=>bag.source===u.uid)?'waiting':'produce'):u.def.manual&&u.cooldown>0?'load':u.def.kind==='wind'?'activate':u.hp<u.def.hp*.4&&!u.def.mobile?'damaged':u.action;
      let progress=unitAction==='deploy'?1-u.ready/RULES.buildTime:unitAction==='hit'?1-u.hit/RULES.hitFlash:unitAction==='load'?1-u.cooldown/u.def.interval:unitAction==='attack'||unitAction==='heal'||unitAction==='activate'&&u.action==='attack'?1-(u.actionUntil-b.time)/RULES.attackPoseTime:undefined;
      if(u.def.kind==='hammer'&&unitAction==='activate'){
        const impact=view.eventPhase('activate','impact')??.5;
        progress=u.pending>0?(1-u.pending/RULES.hammerWindup)*impact:impact+(1-impact)*(1-(u.actionUntil-b.time)/RULES.attackPoseTime);
      }
      view.update(unitAction,b.time,u.facing,u.hit,{progress:progress===undefined?undefined:Phaser.Math.Clamp(progress,0,1)});
      if(ceiling){view.alignAttachment('mount',p.x,ceilingY(u.floor));lift=p.y-view.root.y;}
      if(u.def.kind==='wind'&&u.ready<=0)fx('wind-'+u.uid,'FX-wind',p.x,p.y,VIEW.windSize,'play',(b.time%1.5)/1.5);
      if(u.def.manual){this.health(p.x,p.y-lift-VIEW.deviceHeight-15,u.def.interval-u.cooldown,u.def.interval,VIEW.colors.gold,58);if(u.cooldown<=0)label('ready-'+u.uid,'可发动',p.x,p.y-lift-VIEW.deviceHeight-28,17);}
      if(u.hit>0||this.selectedUnit===u.uid)this.health(p.x,p.y-lift-VIEW.deviceHeight-5,u.hp,u.def.hp,VIEW.colors.green);
      if(this.selectedUnit===u.uid){
        m.lineStyle(3,VIEW.colors.gold,1);m.strokeEllipse(p.x,p.y-lift-5,100,28);
        if(u.def.range>0){m.lineStyle(2,VIEW.colors.gold,.35);m.strokeEllipse(p.x,p.y-20,u.def.range*(VIEW.x1-VIEW.x0)/lastColumn*2,65);}
      }
    }
    const enemyIds=new Set(b.enemies.map(e=>e.uid));
    for(const [uid,view] of this.enemies)if(!enemyIds.has(uid)){view.destroy();this.enemies.delete(uid);}
    for(const e of b.enemies){
      let view=this.enemies.get(e.uid);if(!view){view=new ActorView(this,e.def.id,VIEW.actorHeight*(e.def.heavy?1.2:1));this.enemies.set(e.uid,view);}
      const p=this.enemyScreen(e.uid)!;
      view.root.setPosition(p.x,p.y).setDepth(120+position(e.q).floor*100).setAlpha(e.hp<=0?Math.max(0,1-(b.time-(e.deadAt||0))/RULES.enemyDeathDuration):1);
      const onStairs=position(e.q).stairs;
      const enemyAction=e.hp<=0?'dead':e.drop?'fall':e.hit>0?(e.uid===b.lord.carrier?'carry-hit':'hit'):e.action==='grab'||e.action==='attack'?e.action:onStairs?(e.uid===b.lord.carrier?'carry-stairs':'stairs'):e.action;
      const progress=enemyAction==='dead'?(b.time-(e.deadAt??b.time))/RULES.enemyDeathDuration:enemyAction==='fall'?e.drop!.elapsed/RULES.dropTime:enemyAction==='hit'||enemyAction==='carry-hit'?1-e.hit/RULES.hitFlash:enemyAction==='grab'?e.grab/RULES.captureTime:enemyAction==='attack'?1-(e.actionUntil-b.time)/RULES.attackPoseTime:undefined;
      view.update(enemyAction,b.time,e.face,e.hit,{shield:e.shield>0,progress});
      if(e.hanging&&!onStairs&&!e.drop){view.alignAttachment('grip',p.x,ceilingY(position(e.q).floor));p.y=view.root.y;}
      if(e.hp>0&&(e.hit>0||e.uid===b.focus||e.uid===b.lord.carrier||e.def.id==='E07'))this.health(p.x,p.y-VIEW.actorHeight-12,e.hp,e.def.hp,VIEW.colors.red,e.def.heavy?90:63);
      if(e.shield>0)this.health(p.x,p.y-VIEW.actorHeight-21,e.shield,e.def.shield||1,0x90b5bd,44);
      if(e.poison>0)fx('poison-'+e.uid,'FX-poison-status',p.x,p.y,VIEW.statusSize,'play',(b.time%1.1)/1.1);
      if(e.slow>0)fx('slow-'+e.uid,'FX-slow-ring',p.x,p.y+10,VIEW.statusSize);
      if(e.stun>0)sprite('stun-'+e.uid,'UI-ICONS/warning',p.x,p.y-VIEW.actorHeight-25,30,30);
      if(e.uid===b.focus){m.lineStyle(3,0xffcf74,1);m.strokeEllipse(p.x,p.y-4,83,25);}
      if(e.uid===b.lord.grabber)this.health(p.x,p.y-VIEW.actorHeight-30,e.grab,RULES.captureTime,VIEW.colors.gold,82);
    }
    if(this.lordState!==b.lord.state||b.time<this.lordStateSince){this.lordState=b.lord.state;this.lordStateSince=b.time;}
    let lp=this.screen(b.lord.floor,b.lord.x),action:string='idle',lordFacing=1,lordProgress:number|undefined;
    if(b.lord.state==='carried'){
      const carrier=b.enemies.find(e=>e.uid===b.lord.carrier),cp=carrier?this.enemyScreen(carrier.uid):undefined;
      if(cp){lp=cp;lordFacing=carrier!.face;action='struggle';label('lord-warning','主公被抓',cp.x,cp.y-VIEW.actorHeight-51,23,'#ffbf86');}
    }else if(b.lord.state==='dropped'){const elapsed=b.time-this.lordStateSince;action=elapsed<RULES.dropTime?'fall':'crouch';if(action==='fall')lordProgress=elapsed/RULES.dropTime;label('lord-warning','待救',lp.x,lp.y-VIEW.lordHeight-12,22,'#f2d184');}
    else if(b.lord.state==='grabbing'){action='grab';lordProgress=(b.enemies.find(e=>e.uid===b.lord.grabber)?.grab??0)/RULES.captureTime;}
    else if(b.lord.state==='returning'){
      const end=this.screen(LEVEL.lord.floor,LEVEL.lord.x),t=1-b.lord.returning/RULES.recallTime;
      lp={x:Phaser.Math.Linear(lp.x,end.x,t),y:Phaser.Math.Linear(lp.y,end.y,t)-Math.sin(t*Math.PI)*80};action='return';lordProgress=t;
    }else if(b.phase==='won')action='cheer';
    this.lord.root.setPosition(lp.x,lp.y).setDepth(460).setVisible(b.lord.state!=='lost');this.lord.update(action,b.time,lordFacing,0,{progress:lordProgress});
    if(b.lord.state==='carried'&&b.lord.carrier){const grip=this.enemies.get(b.lord.carrier)?.attachment('carry');if(grip){this.lord.alignAttachment('carried',grip.x,grip.y);lp={x:this.lord.root.x,y:this.lord.root.y};}}
    if(b.lord.shield>0){fx('lord-shield','FX-shield',lp.x,lp.y+10,VIEW.shieldSize);this.health(lp.x,lp.y-145,b.lord.shield,RULES.shieldHp,VIEW.colors.gold,105);}
    if(b.lord.grace>0)fx('lord-grace','FX-rescue',lp.x,lp.y+12,VIEW.statusSize);
    if(b.lord.state==='returning')fx('lord-return','FX-return-trail',lp.x,lp.y,VIEW.statusSize);
    for(const bag of b.bags){const p=this.screen(bag.floor,bag.x),y=p.y-VIEW.bag.lift-Math.sin(b.time*VIEW.bag.bobSpeed+bag.uid)*VIEW.bag.bob;sprite('bag-'+bag.uid,'MX-A/G04-bag',p.x,y,VIEW.bag.width,VIEW.bag.height);label('bag-'+bag.uid,String(bag.amount),p.x,y-30,18,'#ffe9ae');}
    for(const shot of b.projectiles){
      const p=worldPoint(shot.x,shot.y);
      if(!this.projectileOffsets.has(shot.uid)){
        const source=(shot.team==='friendly'?this.units:this.enemies).get(shot.source),muzzle=source?.attachment(shot.team==='friendly'?'muzzle':'weapon'),origin=worldPoint(shot.startX,shot.startY);
        this.projectileOffsets.set(shot.uid,muzzle?{x:muzzle.x-origin.x,y:muzzle.y-origin.y}:{x:0,y:0});
      }
      const offset=this.projectileOffsets.get(shot.uid)!,blend=Math.max(0,1-(b.time-shot.born)/VIEW.projectileBlend);
      if(shot.kind!=='log'){p.x+=offset.x*blend;p.y+=offset.y*blend;}
      if(shot.kind==='arrow')sprite('shot-'+shot.uid,'FX/arrow',p.x,p.y,58,11).setRotation(Math.atan2(-shot.vy,shot.vx));
      else if(shot.kind==='poison')sprite('shot-'+shot.uid,'FX/poison-drop',p.x,p.y,18,29);
      else sprite('shot-'+shot.uid,'MX-B/M02-log',p.x,p.y+23,80,55).setRotation(b.time*Math.sign(shot.vx)*4);
    }
    for(const effect of b.effects){
      const p=this.screen(effect.floor,effect.x),t=1-effect.life/effect.maxLife;
      const id=VIEW.effectArt[effect.kind];if(id)fx('effect-'+effect.uid,id,p.x,p.y,VIEW.effectSize,'play',t);
      if(effect.value)label('effect-'+effect.uid,'+'+effect.value,p.x,p.y-85-t*35,24,effect.kind==='heal'?'#b6ecc7':'#ffe29c').setAlpha(1-t);
    }
    if(b.phase!=='select')for(const [key,entry] of Object.entries(LEVEL.entries)){
      const p=this.screen(entry.floor,entry.x),opened=b.wave>=entry.wave;
      const warning=b.phase==='wave'&&b.wave===entry.wave&&b.waveTime<RULES.entryWarning&&key!=='A';
      const caption=warning?`${entry.name} ${Math.ceil(RULES.entryWarning-b.waveTime)}秒`:opened?(key==='A'?'撤离口':'援军入口'):`第${entry.wave}波开启`;
      label('entry-'+key,caption,p.x,p.y+26,19,key==='A'?'#ffb398':warning?'#ffe391':'#d2e2d5');
    }
    if(b.wave===LEVEL.waves.length&&b.waveTime>=16&&b.waveTime<24)label('boss','曹洪将至',VIEW.width/2,117,27,'#ffd096');
    for(const [key,text] of this.labels)if(!usedLabels.has(key)){text.destroy();this.labels.delete(key);}
    for(const [key,view] of this.fx)if(!usedFx.has(key)){view.destroy();this.fx.delete(key);}
    for(const [key,image] of this.sprites)if(!usedSprites.has(key)){image.destroy();this.sprites.delete(key);}
    const projectileIds=new Set(b.projectiles.map(shot=>shot.uid));for(const uid of this.projectileOffsets.keys())if(!projectileIds.has(uid))this.projectileOffsets.delete(uid);
  }
}
