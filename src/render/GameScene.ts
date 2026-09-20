import Phaser from 'phaser';
import { CARD, ENEMY, HERO_SKILLS, LEVEL, RULES, VIEW } from '../config';
import { Battle } from '../game/Battle';
import { entryOpen, lastColumn, position } from '../game/map';
import type { Action, Command, Effect } from '../game/types';
import { AudioPlayer, BGM_BYTES } from '../platform';
import { stageCoordinates, stagePoint } from '../viewport';
import { UI, type UIController } from '../ui';
import { ActorView, installFrames, installPreviews, preloadArt, preloadInterfaceImages, manifest } from './art';
import { LoadingScreen } from '../loading';
import { Opening } from './Opening';
import { ceilingY, floorPoint, routePoint, worldPoint } from './layout';
import { WorldLabels } from './WorldLabels';
import characterMetrics from './character-metrics.json';

interface FieldGesture { pointerId:number;startX:number;startY:number;lastX:number;lastY:number;x:number;y:number;moved:boolean;fromDeck:boolean;coordinates:ReturnType<typeof stageCoordinates>;card?:string;unit?:number;mode:'pending'|'pan'|'card-scroll'|'deploy'|'rally';holdTimer?:number }

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
  private campDancers:ActorView[]=[];
  private campDancersDismissed=false;
  private campTime=0;
  private lordState='';
  private lordStateSince=0;
  private graphics!:Phaser.GameObjects.Graphics;
  private marks!:Phaser.GameObjects.Graphics;
  private accumulator=0;
  private uiTimer=0;
  private heard=0;
  private announcedBoss=0;
  private worldLabels!:WorldLabels;
  private apertures!:Phaser.GameObjects.Graphics;
  private scenery=new Map<string,ActorView>();
  private fx=new Map<string,ActorView>();
  private sprites=new Map<string,Phaser.GameObjects.Image>();
  private projectileOffsets=new Map<number,{x:number;y:number}>();
  private retiring=new Map<number,{view:ActorView;since:number;action:string}>();
  private point?:{floor:number;x:number};
  private opening?:Opening;
  private arrival?:{elapsed:number;fromX:number;fromY:number;toX:number;toY:number};
  constructor(){super('game');}

  preload(){
    LoadingScreen.assets({...Object.fromEntries(Object.entries(manifest.files).filter(([,file])=>file.preload!==false)),bgm:{bytes:BGM_BYTES}});
    this.load.on('fileprogress',(file:Phaser.Loader.File,value:number)=>LoadingScreen.file(file.key,value));
    this.load.on('filecomplete',(key:string)=>LoadingScreen.file(key,1));
    this.load.on('loaderror',()=>LoadingScreen.fail('资源加载失败，请重试'));
    preloadArt(this,manifest.loadingGroups.intro);
  }
  create(){
    if(LoadingScreen.hasFailed)return;
    try{
      installFrames(this);
      document.getElementById('ui')!.style.visibility='hidden';
      this.opening=new Opening(this,()=>{this.opening=undefined;this.resetCamera();document.getElementById('ui')!.style.visibility='';this.ui.update();});
      this.bindLifecycle();
      const interfaceReady=Promise.all([
        preloadInterfaceImages(),
        document.fonts.load('32px "Tower Display"'),
        this.audioPlayer.prepare(value=>LoadingScreen.file('bgm',value)),
      ]).catch(error=>{LoadingScreen.fail('资源加载失败，请重试');console.error(error);});
      // Animate the camp while the battle atlases download in the background.
      this.load.once('complete',async()=>{
        await interfaceReady;
        if(LoadingScreen.hasFailed)return;
        try{this.createWorld();this.opening!.setReady();}
        catch(error){LoadingScreen.fail('画面载入失败，请重试');console.error(error);}
      });
      preloadArt(this);WorldLabels.preload(this);this.load.start();
    }catch(error){LoadingScreen.fail('画面载入失败，请重试');console.error(error);}
  }
  private createWorld(){
    LoadingScreen.progress(.94,'准备画面');
    installFrames(this);
    installPreviews(this);
    LoadingScreen.progress(.98,'准备画面');
    this.add.image(0,VIEW.backgroundY,'B01').setOrigin(0,0).setDisplaySize(VIEW.width,VIEW.height);
    this.apertures=this.add.graphics().setDepth(80);
    this.worldLabels=new WorldLabels(this);
    this.graphics=this.add.graphics().setDepth(480);
    this.marks=this.add.graphics().setDepth(500);
    this.lord=new ActorView(this,'L01',VIEW.lordHeight);
    this.campDancers=VIEW.campDancers.offsets.map(()=>new ActorView(this,'B05-dancer',VIEW.campDancers.height));
    this.scenery.set('gate',new ActorView(this,'B03-gate',VIEW.gateHeight));
    this.scenery.set('barrier',new ActorView(this,'B03-barrier',VIEW.gateHeight));
    this.ui=new UI(this);
    this.bindControls();
    this.paint();
  }
  private bindLifecycle(){
    const visibility=()=>{if(this.opening)this.opening.paused=document.hidden;if(document.hidden){this.audioPlayer.setActive(false);this.cancelDrag();if(this.battle.active){this.battle.paused=true;this.ui.update();}}};
    const blur=()=>{this.audioPlayer.setActive(false);this.cancelDrag();if(this.opening)this.opening.paused=true;if(this.battle.active){this.battle.paused=true;this.ui.update();}};
    const focus=()=>{if(this.opening)this.opening.paused=document.hidden;};
    const resize=()=>{this.cancelDrag();this.scale.updateBounds();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);window.addEventListener('focus',focus);window.addEventListener('stage-resize',resize);
    const recoverAudio=()=>this.audioPlayer.unlock();
    document.addEventListener('touchend',recoverAudio,{capture:true,passive:true});
    document.addEventListener('click',recoverAudio,{capture:true});
    document.addEventListener('WeixinJSBridgeReady',recoverAudio);
    this.events.once('shutdown',()=>{
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);window.removeEventListener('stage-resize',resize);
      document.removeEventListener('touchend',recoverAudio,true);document.removeEventListener('click',recoverAudio,true);document.removeEventListener('WeixinJSBridgeReady',recoverAudio);
      this.audioPlayer.destroy();this.opening?.destroy();
    });
  }

  start(deck:string[]){if(this.battle.start(deck)){this.resetCamera();this.beginArrival();}this.ui.update();}
  restart(select:boolean){
    this.cancelDrag();
    const deck=[...this.battle.deck];this.battle=new Battle();this.battle.deck=deck;
    this.selectedCard=undefined;this.selectedUnit=undefined;this.dragUnit=undefined;this.accumulator=0;this.heard=0;this.announcedBoss=0;
    this.campDancersDismissed=false;this.campTime=0;
    for(const view of this.units.values())view.destroy();for(const view of this.enemies.values())view.destroy();
    this.units.clear();this.enemies.clear();
    for(const item of this.retiring.values())item.view.destroy();this.retiring.clear();
    for(const view of this.fx.values())view.destroy();this.fx.clear();for(const image of this.sprites.values())image.destroy();this.sprites.clear();
    this.projectileOffsets.clear();
    this.resetCamera();if(!select&&this.battle.start(deck))this.beginArrival();this.ui.reset();
  }
  toggleSound(){this.audioPlayer.enabled=!this.audioPlayer.enabled;this.audioPlayer.unlock();}
  action(type:string,uid?:number){
    if(type==='pause'){this.cancelDrag();if(this.battle.active)this.battle.paused=true;}
    else if(type==='deselect'){this.cancelDrag();this.selectedUnit=undefined;}
    else if(type==='select'){this.cancelDrag();this.selectedUnit=uid;}
    else if(type==='shield')this.battle.command({type});
    else if(uid!==undefined&&['activate','sell','turn'].includes(type)){this.battle.command({type,uid} as Command);if(type==='sell')this.selectedUnit=undefined;}
    this.ui.update();
  }
  update(_time:number,delta:number){
    this.audioPlayer.setActive(!document.hidden&&(this.opening?!this.opening.paused:!this.battle.paused&&(this.battle.active||this.battle.phase==='select')));
    if(this.opening){this.opening.update(Math.min(delta/1000,RULES.maxFrameSeconds));return;}
    if(!this.ui)return;
    if(!this.battle.paused&&!document.hidden&&(this.battle.active||this.battle.phase==='select'))this.campTime+=Math.min(delta/1000,RULES.maxFrameSeconds);
    if(this.arrival){
      if(!this.battle.paused&&!document.hidden)this.updateArrival(Math.min(delta/1000,RULES.maxFrameSeconds));
      this.paint();this.ui.update();return;
    }
    if(this.gesture&&(!this.battle.active||this.battle.paused||(this.dragUnit!==undefined&&!this.battle.units.some(u=>u.uid===this.dragUnit&&u.hp>0))))this.cancelDrag();
    this.scrollDrag(Math.min(delta/1000,RULES.maxFrameSeconds));
    this.accumulator+=Math.min(delta/1000,RULES.maxFrameSeconds);
    while(this.accumulator>=RULES.step){this.battle.step(RULES.step);this.accumulator-=RULES.step;}
    const arrival=this.battle.effects.find(effect=>effect.kind==='boss'&&effect.uid>this.announcedBoss);
    if(arrival&&!this.battle.paused){this.announcedBoss=arrival.uid;this.cameras.main.shake(VIEW.boss.shakeMs,VIEW.boss.shakeIntensity);}
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
    return x>=VIEW.x0-halfCell&&x<=VIEW.x1+halfCell&&y>=0&&y<=VIEW.floorY[0]+32;
  }
  private pointerPoint(event:PointerEvent){
    if(this.gesture)return this.gesture.coordinates(event.clientX,event.clientY);
    return stagePoint(this.inputStage!,event.clientX,event.clientY);
  }
  private resetCamera(){
    this.arrival=undefined;this.accumulator=0;
    const top=VIEW.input.fieldTop,height=VIEW.input.fieldBottom-top;
    this.cameras.main.setViewport(0,top,VIEW.width,height).setZoom(VIEW.camera.zoom)
      .setBounds(0,0,VIEW.width,VIEW.floorY[0]+60).centerOn(VIEW.x0,VIEW.floorY[0]).preRender();
  }
  private beginArrival(){
    const camera=this.cameras.main,toX=camera.scrollX,toY=camera.scrollY;
    const lord=this.screen(LEVEL.lord.floor,LEVEL.lord.x);
    camera.centerOn(lord.x,lord.y-VIEW.lordHeight/2).preRender();
    this.arrival={elapsed:0,fromX:camera.scrollX,fromY:camera.scrollY,toX,toY};
  }
  private updateArrival(seconds:number){
    const arrival=this.arrival;if(!arrival)return;
    arrival.elapsed+=seconds;
    if(arrival.elapsed<=VIEW.camera.arrivalHold)return;
    const progress=Math.min(1,(arrival.elapsed-VIEW.camera.arrivalHold)/VIEW.camera.arrivalPan);
    const eased=progress*progress*(3-2*progress);
    this.cameras.main.setScroll(Phaser.Math.Linear(arrival.fromX,arrival.toX,eased),Phaser.Math.Linear(arrival.fromY,arrival.toY,eased)).preRender();
    if(progress===1)this.arrival=undefined;
  }
  private inCamera(x:number,y:number){
    const camera=this.cameras.main;
    return x>=camera.x&&x<=camera.x+camera.width&&y>=camera.y&&y<=camera.y+camera.height;
  }
  private panCamera(dx:number,dy:number){
    if(!dx&&!dy)return;
    const camera=this.cameras.main;
    camera.setScroll(camera.clampX(camera.scrollX+dx/camera.zoom),camera.clampY(camera.scrollY+dy/camera.zoom));
    // Phaser 4 includes scroll in its picking matrix; refresh it before drag hit tests.
    camera.preRender();
  }
  private scrollDrag(seconds:number){
    const drag=this.gesture;
    if(!drag?.moved||!['deploy','rally'].includes(drag.mode)||!this.inCamera(drag.x,drag.y))return;
    const camera=this.cameras.main,edge=VIEW.camera.edgeSize;
    const speed=(value:number,min:number,max:number)=>value<min+edge?-(1-(value-min)/edge):value>max-edge?1-(max-value)/edge:0;
    this.panCamera(speed(drag.x,camera.x,camera.x+camera.width)*VIEW.camera.edgeSpeed*seconds,
      speed(drag.y,camera.y,camera.y+camera.height)*VIEW.camera.edgeSpeed*seconds);
    this.previewDrag(drag.x,drag.y);
  }
  private bindControls(){
    const stage=this.inputStage=document.getElementById('stage')!;
    const beginDrag=(drag:FieldGesture)=>{
      if(drag.card){drag.mode='deploy';this.selectedCard=drag.card;this.selectedUnit=undefined;}
      else if(drag.unit!==undefined&&this.battle.units.some(u=>u.uid===drag.unit&&u.hp>0)){
        drag.mode='rally';this.selectedCard=undefined;this.dragUnit=drag.unit;this.selectedUnit=drag.unit;
      }else return;
      this.previewDrag(drag.x,drag.y);this.ui.update();
    };
    const down=(event:PointerEvent)=>{
      if(this.gesture||!event.isPrimary||event.button!==0||this.opening||!this.battle.active||this.battle.paused)return;
      const target=event.target instanceof Element?event.target:undefined;
      const fromDeck=!!target?.closest('#deck-bar');
      const card=target?.closest<HTMLElement>('#deck-bar [data-card]')?.dataset.card;
      if(!fromDeck&&target!==this.game.canvas)return;
      const coordinates=stageCoordinates(stage),screen=coordinates(event.clientX,event.clientY),p=this.cameras.main.getWorldPoint(screen.x,screen.y);
      if(!fromDeck&&!this.inCamera(screen.x,screen.y))return;
      this.arrival=undefined;
      const unit=!fromDeck&&!this.selectedCard?this.battle.units.find(u=>u.def.mobile&&u.hp>0&&this.units.get(u.uid)?.bounds.contains(p.x,p.y)):undefined;
      const drag:FieldGesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:screen.x,lastY:screen.y,x:screen.x,y:screen.y,moved:false,fromDeck,coordinates,card,unit:unit?.uid,mode:'pending'};
      this.gesture=drag;
      if(card||unit)drag.holdTimer=window.setTimeout(()=>{if(this.gesture===drag&&!drag.moved)beginDrag(drag);},VIEW.input.longPressMs);
      stage.setPointerCapture(event.pointerId);event.preventDefault();this.audioPlayer.unlock();
    };
    const move=(event:PointerEvent)=>{
      const drag=this.gesture;if(!drag||event.pointerId!==drag.pointerId)return;
      const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
      drag.moved ||= Math.hypot(dx,dy)>=VIEW.input.dragThreshold;
      const p=this.pointerPoint(event);drag.x=p.x;drag.y=p.y;
      if(drag.moved&&drag.mode==='pending'){
        window.clearTimeout(drag.holdTimer);
        const start=drag.coordinates(drag.startX,drag.startY);
        if(drag.fromDeck){if(!drag.card||Math.abs(p.x-start.x)>Math.abs(p.y-start.y)*1.15)drag.mode='card-scroll';else beginDrag(drag);}
        else drag.mode='pan';
      }
      // Keep the press position until dragging starts, so the initial motion is preserved.
      if(drag.mode==='pending')return;
      if(drag.mode==='pan'){
        this.panCamera(drag.lastX-p.x,drag.lastY-p.y);
      }
      if(drag.mode==='card-scroll')this.ui.scrollCards(drag.lastX-p.x);
      drag.lastX=p.x;drag.lastY=p.y;
      if(drag.mode==='deploy'||drag.mode==='rally')this.previewDrag(p.x,p.y);
      event.preventDefault();
    };
    const up=(event:PointerEvent)=>{
      const drag=this.gesture;if(!drag||event.pointerId!==drag.pointerId)return;
      if(drag.moved||Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>=VIEW.input.dragThreshold)move(event);
      const screen=this.pointerPoint(event),p=this.cameras.main.getWorldPoint(screen.x,screen.y),target=document.elementFromPoint(event.clientX,event.clientY);
      const inField=this.inCamera(screen.x,screen.y)&&this.insideField(p.x,p.y)&&target===this.game.canvas;
      this.cancelDrag(false);
      if(this.battle.active&&!this.battle.paused&&inField){
        if(drag.mode==='deploy'&&drag.card){const slot=this.fieldPoint(p.x,p.y,drag.card);this.battle.command({type:'deploy',card:drag.card,...slot,facing:slot.floor%2?1:-1});}
        else if(drag.mode==='rally'&&drag.moved&&drag.unit!==undefined){
          const slot=this.fieldPoint(p.x,p.y),error=this.battle.rallyError(drag.unit,slot.floor,slot.x);
          if(error)this.battle.tell(error);else this.battle.command({type:'rally',uid:drag.unit,x:slot.x});
        }else if(drag.mode==='pending'&&!drag.card&&!drag.moved)this.clickField(p.x,p.y);
      }
      if(drag.mode==='pending'&&drag.card&&!drag.moved){
        this.selectedCard=this.selectedCard===drag.card?undefined:drag.card;this.selectedUnit=undefined;
      }
      if(drag.mode==='deploy'||drag.mode==='rally')this.selectedCard=undefined;
      this.ui.update();
    };
    const cancel=(event:PointerEvent)=>{if(event.pointerId===this.gesture?.pointerId&&(event.type!=='lostpointercapture'||event.target===stage))this.cancelDrag();};
    const contextMenu=(event:Event)=>event.preventDefault();
    stage.addEventListener('contextmenu',contextMenu);
    stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move);
    stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',cancel);stage.addEventListener('lostpointercapture',cancel);
    this.events.once('shutdown',()=>{
      this.cancelDrag();stage.removeEventListener('pointerdown',down);stage.removeEventListener('pointermove',move);
      stage.removeEventListener('pointerup',up);stage.removeEventListener('pointercancel',cancel);stage.removeEventListener('lostpointercapture',cancel);
      stage.removeEventListener('contextmenu',contextMenu);
    });
  }
  private previewDrag(x:number,y:number){
    const card=this.selectedCard,unit=this.battle.units.find(u=>u.uid===this.dragUnit),id=card||unit?.def.id;
    if(!id)return;
    const world=this.cameras.main.getWorldPoint(x,y);
    this.point=this.inCamera(x,y)&&this.insideField(world.x,world.y)?this.fieldPoint(world.x,world.y,card):undefined;
    const valid=!!this.point&&!(card?this.battle.placementError(card,this.point.floor,this.point.x):this.battle.rallyError(unit!.uid,this.point.floor,this.point.x));
    this.ui.showDrag(id,x,y,valid);
  }
  private cancelDrag(clearSelection=true){
    const pointer=this.gesture?.pointerId;window.clearTimeout(this.gesture?.holdTimer);this.gesture=undefined;
    if(pointer!==undefined&&this.inputStage?.hasPointerCapture(pointer))this.inputStage.releasePointerCapture(pointer);
    if(clearSelection)this.selectedCard=undefined;this.dragUnit=undefined;this.point=undefined;
    this.ui?.hideDrag();this.marks?.clear();
  }
  private clickField(x:number,y:number){
    const b=this.battle;if(!b.active||b.paused||!this.insideField(x,y))return;
    if(this.selectedCard){const slot=this.fieldPoint(x,y,this.selectedCard);if(b.command({type:'deploy',card:this.selectedCard,...slot,facing:slot.floor%2?1:-1}))this.selectedCard=undefined;return;}
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

  private health(x:number,y:number,value:number,max:number,color:number,width=63){
    const g=this.graphics;g.fillStyle(0x151c18,.9);g.fillRoundedRect(x-width/2-2,y-2,width+4,10,3);
    g.fillStyle(color,1);g.fillRect(x-width/2,y,width*Math.max(0,value/max),6);
  }

  private paint(){
    const b=this.battle,g=this.graphics,m=this.marks;g.clear();m.clear();
    this.worldLabels.begin();this.apertures.clear();
    for(const hatch of b.units.filter(u=>u.def.kind==='hatch'&&u.openUntil>b.time)){
      const p=this.screen(hatch.floor,hatch.x);
      this.apertures.fillStyle(0x171b1b).fillRoundedRect(p.x-47,p.y-9,94,49,5);
    }
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
    for(const [id,entryKey] of [['gate','B'],['barrier','C']] as const){const entry=LEVEL.entries[entryKey],p=this.screen(entry.floor,entry.x),view=this.scenery.get(id)!;
      view.root.setPosition(p.x,p.y).setDepth(85);view.update(b.wave>=entry.wave?'open':'idle',b.time,1,0,{progress:b.wave>entry.wave?1:b.wave===entry.wave?Math.min(1,b.waveTime/RULES.entryWarning):0});}
    const draggingUnit=b.units.find(u=>u.uid===this.dragUnit);
    if((this.selectedCard||draggingUnit)&&b.active&&!b.paused){
      for(let floor=0;floor<LEVEL.floors;floor++)for(let col=0;col<LEVEL.columns;col++){
        const error=this.selectedCard?b.placementError(this.selectedCard,floor,col):b.rallyError(draggingUnit!.uid,floor,col);
        if(error)continue;
        const p=this.slotPoint(floor,col,this.selectedCard);
        m.fillStyle(0x704315,.5);m.fillRoundedRect(p.x-53,p.y-20,106,40,6);
        m.lineStyle(6,0x342217,.95);m.strokeRoundedRect(p.x-53,p.y-20,106,40,6);
        m.lineStyle(3,0xd29a42,1);m.strokeRoundedRect(p.x-53,p.y-20,106,40,6);
      }
      if(this.point){
        const p=this.slotPoint(this.point.floor,this.point.x,this.selectedCard);
        const error=this.selectedCard?b.placementError(this.selectedCard,this.point.floor,this.point.x):b.rallyError(draggingUnit!.uid,this.point.floor,this.point.x);
        m.lineStyle(7,0x342217,.95);m.strokeEllipse(p.x,p.y,108,28);
        m.lineStyle(4,error?VIEW.colors.red:0xffcf73,1);m.strokeEllipse(p.x,p.y,108,28);
      }
    }
    const unitIds=new Set(b.units.map(u=>u.uid));
    for(const [uid,view] of this.units)if(!unitIds.has(uid)){this.retiring.set(uid,{view,since:b.time,action:view.hasAction('destroy')?'destroy':'dead'});this.units.delete(uid);}
    for(const [uid,item] of this.retiring){const progress=(b.time-item.since)/VIEW.destroyDuration;
      if(progress>=1){item.view.destroy();this.retiring.delete(uid);}else{item.view.update(item.action,b.time,item.view.facing,0,{progress});item.view.root.setAlpha(1-progress);}}
    for(const u of b.units){
      let view=this.units.get(u.uid);if(!view){
        const ratio=characterMetrics[u.def.id as keyof typeof characterMetrics]?.bodyRatio||1;
        const size=u.def.mobile?(u.def.hero?VIEW.heroHeight:VIEW.guardHeight)/ratio:u.def.kind==='hammer'?512*(VIEW.floorY[u.floor]-ceilingY(u.floor))/(680-32):VIEW.deviceHeight;
        view=new ActorView(this,u.def.id,size);this.units.set(u.uid,view);
      }
      const p=this.screen(u.floor,u.x),ceiling=u.def.surfaces.includes('ceiling');
      let lift=u.def.surfaces.length===1&&u.def.surfaces[0]==='wall'?VIEW.wallLift:0;
      view.root.setPosition(p.x,p.y-lift).setDepth(100+u.floor*100+(ceiling?0:10)).setAlpha(u.ready>0?.45:1);
      const incomeAvailable=b.active;
      const unitAction=u.ready>0?'deploy':u.openUntil>b.time?'open':u.action==='attack'&&!u.def.mobile?'activate':u.def.kind==='income'?(incomeAvailable?'produce':'idle'):u.def.manual&&u.cooldown>0?'load':u.def.kind==='wind'?'activate':u.def.destructible&&u.hp<u.def.hp*.4&&!u.def.mobile?'damaged':u.action;
      let progress=unitAction==='deploy'?1-u.ready/RULES.buildTime:unitAction==='hit'?1-u.hit/RULES.hitFlash:unitAction==='load'?1-u.cooldown/u.def.interval:unitAction==='attack'||unitAction==='heal'||unitAction==='activate'&&u.action==='attack'?1-(u.actionUntil-b.time)/RULES.attackPoseTime:undefined;
      if(unitAction==='skill')progress=1-(u.actionUntil-b.time)/RULES.heroSkillPoseTime;
      if(u.def.kind==='hammer'&&unitAction==='activate'){
        const impact=view.eventPhase('activate','impact')??.5;
        progress=u.pending>0?(1-u.pending/RULES.hammerWindup)*impact:impact+(1-impact)*(1-(u.actionUntil-b.time)/RULES.attackPoseTime);
      }
      view.update(unitAction,b.time,u.facing,u.hit,{progress:progress===undefined?undefined:Phaser.Math.Clamp(progress,0,1)});
      if(ceiling){view.alignAttachment('mount',p.x,ceilingY(u.floor));lift=p.y-view.root.y;}
      if(u.def.kind==='income'){
        const box=view.bounds,padding=10;
        g.fillStyle(0xffd34f,.1).fillRoundedRect(box.x-padding,box.y-padding,box.width+padding*2,box.height+padding*2,12);
        g.lineStyle(8,0x2b1c0a,.95).strokeRoundedRect(box.x-padding,box.y-padding,box.width+padding*2,box.height+padding*2,12);
        g.lineStyle(4,0xffd34f,1).strokeRoundedRect(box.x-padding,box.y-padding,box.width+padding*2,box.height+padding*2,12);
      }
      if(u.ready<=0)this.worldLabels.show('unit-'+u.uid,`${u.def.name}${u.level>0?` · ${u.level+1}级`:''}${u.def.kind==='income'?' · 产军饷':''}`,p.x,ceiling?view.bounds.bottom+17:p.y+20,u.def.kind==='income'?'economy':'name');
      if(u.def.kind==='wind'&&u.ready<=0)fx('wind-'+u.uid,'FX-wind',p.x,p.y,VIEW.windSize,'play',(b.time%1.5)/1.5);
      if(u.def.manual){this.health(p.x,p.y-lift-VIEW.deviceHeight-15,u.def.interval-u.cooldown,u.def.interval,VIEW.colors.gold,58);if(u.cooldown<=0)sprite('ready-'+u.uid,'UI-ICONS/play',p.x,p.y-lift-VIEW.deviceHeight-36,26,30);}
      const healthY=u.def.mobile?p.y-(u.def.hero?VIEW.heroHeight:VIEW.guardHeight)-15:p.y-lift-VIEW.deviceHeight-5;
      if(u.def.destructible&&(u.healthRevealed||this.selectedUnit===u.uid))this.health(p.x,healthY,u.hp,u.def.hp,VIEW.colors.green,u.def.hero?86:63);
      if(this.selectedUnit===u.uid){
        m.lineStyle(3,VIEW.colors.gold,1);m.strokeEllipse(p.x,p.y-lift-5,100,28);
        if(u.def.range>0){m.lineStyle(2,VIEW.colors.gold,.35);m.strokeEllipse(p.x,p.y-20,u.def.range*(VIEW.x1-VIEW.x0)/lastColumn*2,65);}
      }
    }
    const enemyIds=new Set(b.enemies.map(e=>e.uid));
    for(const [uid,view] of this.enemies)if(!enemyIds.has(uid)){view.destroy();this.enemies.delete(uid);}
    for(const e of b.enemies){
      const height=VIEW.actorHeight*(e.def.boss?VIEW.boss.heightScale:e.def.heavy?1.2:1);
      let view=this.enemies.get(e.uid);if(!view){view=new ActorView(this,e.def.id,height);this.enemies.set(e.uid,view);}
      const p=this.enemyScreen(e.uid)!;
      view.root.setPosition(p.x,p.y).setDepth(120+position(e.q).floor*100).setAlpha(e.hp<=0?Math.max(0,1-(b.time-(e.deadAt||0))/RULES.enemyDeathDuration):1);
      const onStairs=position(e.q).stairs;
      const enemyAction=e.hp<=0?'dead':e.drop?'fall':e.stun>0?'hit':e.action==='grab'||e.action==='attack'?e.action:onStairs?(e.uid===b.lord.carrier?'carry-stairs':'stairs'):e.action;
      const progress=enemyAction==='dead'?(b.time-(e.deadAt??b.time))/RULES.enemyDeathDuration:enemyAction==='fall'?(e.drop?e.drop.elapsed/RULES.dropTime:1-e.landing/RULES.scoutLandTime):enemyAction==='hit'?.4:enemyAction==='grab'?e.grab/RULES.captureTime:enemyAction==='attack'?Phaser.Math.Clamp(1-(e.actionUntil-b.time)/RULES.attackPoseTime,0,1):undefined;
      const carrying=e.uid===b.lord.carrier&&['carry','carry-stairs'].includes(enemyAction);
      const carryProgress=carrying?((b.time-(b.lord.carriedAt??b.time))/RULES.carryAnimationDuration)%1:undefined;
      view.update(enemyAction,b.time,e.face,e.hit,{shield:e.shield>0,progress:carryProgress??progress});
      if(e.hanging&&!onStairs&&!e.drop){view.alignAttachment('grip',p.x,ceilingY(position(e.q).floor));p.y=view.root.y;}
      if(e.hp>0&&(e.healthRevealed||e.uid===b.focus||e.uid===b.lord.carrier||e.def.boss))this.health(p.x,p.y-height-12,e.hp,e.def.hp,VIEW.colors.red,e.def.heavy?90:63);
      if(e.hp>0&&e.def.boss){g.lineStyle(4,0xf16b31,.6).strokeEllipse(p.x,p.y-5,150+Math.sin(b.time*5)*12,34);this.worldLabels.show('boss-name-'+e.uid,e.def.name,p.x,p.y-height-40,'speech');}
      if(e.hp>0&&e.def.thief)this.worldLabels.show('thief-'+e.uid,e.loot?`携饷 ${e.loot} · 逃跑`:'刺客 · 偷军饷',p.x,p.y-height-26,'name');
      if(e.shield>0)this.health(p.x,p.y-VIEW.actorHeight-21,e.shield,e.def.shield||1,0x90b5bd,44);
      if(e.poison>0)fx('poison-'+e.uid,'FX-poison-status',p.x,p.y,VIEW.statusSize,'play',(b.time%1.1)/1.1);
      if(e.slow>0)fx('slow-'+e.uid,'FX-slow-ring',p.x,p.y+10,VIEW.statusSize);
      if(e.stun>0)sprite('stun-'+e.uid,'UI-ICONS/warning',p.x,p.y-VIEW.actorHeight-25,30,30);
      if(e.uid===b.focus){m.lineStyle(3,0xffcf74,1);m.strokeEllipse(p.x,p.y-4,83,25);}
      if(e.uid===b.lord.grabber)this.health(p.x,p.y-VIEW.actorHeight-30,e.grab,RULES.captureTime,VIEW.colors.gold,82);
    }
    if(this.lordState!==b.lord.state||b.time<this.lordStateSince){this.lordState=b.lord.state;this.lordStateSince=b.time;}
    let lp=this.screen(b.lord.floor,b.lord.x),action:string='idle',lordFacing=-1,lordProgress:number|undefined;
    if(b.lord.state==='carried'){
      const carrier=b.enemies.find(e=>e.uid===b.lord.carrier),cp=carrier?this.enemyScreen(carrier.uid):undefined;
      if(cp){lp=cp;lordFacing=carrier!.face;action='struggle';sprite('lord-warning','UI-ICONS/grab',cp.x,cp.y-VIEW.actorHeight-51,40,40);}
    }else if(b.lord.state==='dropped'){const elapsed=b.time-this.lordStateSince;action=elapsed<RULES.dropTime?'fall':'crouch';if(action==='fall')lordProgress=elapsed/RULES.dropTime;sprite('lord-warning','UI-ICONS/rescue',lp.x,lp.y-VIEW.lordHeight-24,40,40);}
    else if(b.lord.state==='grabbing'){action='grab';lordProgress=(b.enemies.find(e=>e.uid===b.lord.grabber)?.grab??0)/RULES.captureTime;}
    else if(b.lord.state==='returning'){
      const end=this.screen(LEVEL.lord.floor,LEVEL.lord.x),t=1-b.lord.returning/RULES.recallTime;
      lp={x:Phaser.Math.Linear(lp.x,end.x,t),y:Phaser.Math.Linear(lp.y,end.y,t)-Math.sin(t*Math.PI)*80};action='return';lordProgress=t;
    }else if(b.phase==='won')action='cheer';
    this.lord.root.setPosition(lp.x,lp.y).setDepth(460).setVisible(b.lord.state!=='lost');this.lord.update(action,action==='idle'?this.campTime:b.time,lordFacing,0,{progress:lordProgress});
    if(action==='crouch')this.campDancersDismissed=true;
    const camp=this.screen(LEVEL.lord.floor,LEVEL.lord.x);
    const showDancers=!this.campDancersDismissed&&b.lord.state==='idle'&&b.phase!=='won';
    for(const [index,dancer] of this.campDancers.entries()){
      const offset=VIEW.campDancers.offsets[index];
      dancer.root.setPosition(camp.x+offset.x,camp.y+offset.y).setDepth(340+index).setVisible(showDancers);
      if(showDancers)dancer.update('dance',this.campTime,1,0,{phaseOffset:index*VIEW.intro.danceOffset});
    }
    if(b.lord.state==='carried'&&b.lord.carrier){const grip=this.enemies.get(b.lord.carrier)?.attachment('carry');if(grip){this.lord.alignAttachment('carried',grip.x,grip.y);lp={x:this.lord.root.x,y:this.lord.root.y};}}
    const lordBounds=this.lord.bounds,camera=this.cameras.main;
    this.ui.trackLord(camera.matrixCombined.transformPoint(lordBounds.centerX,lordBounds.centerY),camera);
    if(b.lord.shield>0){fx('lord-shield','FX-shield',lp.x,lp.y+10,VIEW.shieldSize);this.health(lp.x,lp.y-145,b.lord.shield,RULES.shieldHp,VIEW.colors.gold,105);}
    if(b.lord.grace>0)fx('lord-grace','FX-rescue',lp.x,lp.y+12,VIEW.statusSize);
    if(b.lord.state==='returning')fx('lord-return','FX-return-trail',lp.x,lp.y,VIEW.statusSize);
    if(b.phase!=='select'){
      this.worldLabels.show('lord-name','刘备',lp.x,lp.y+22);
      const speech=b.lord.state==='carried'?'快拦住他！':b.lord.state==='dropped'?'扶我回营！':b.lord.state==='grabbing'?'护驾！护驾！':b.phase==='prepare'?'守住新野！':b.phase==='won'?'诸位辛苦了！':'';
      if(speech)this.worldLabels.show('lord-speech',speech,lp.x-55,lp.y-VIEW.lordHeight-20,'speech');
      for(let floor=0;floor<3;floor++)this.worldLabels.show('tier-'+floor,['城外','城内','营帐'][floor],this.cameras.main.worldView.left+34,VIEW.floorY[floor]-59,'banner');
    }
    this.paintIncome();
    for(const shot of b.projectiles){
      const p=worldPoint(shot.x,shot.y);
      if(!this.projectileOffsets.has(shot.uid)){
        const source=(shot.team==='friendly'?this.units:this.enemies).get(shot.source),muzzle=source?.attachment(shot.team==='friendly'?'muzzle':'weapon'),origin=worldPoint(shot.startX,shot.startY);
        this.projectileOffsets.set(shot.uid,muzzle?{x:muzzle.x-origin.x,y:muzzle.y-origin.y}:{x:0,y:0});
      }
      const offset=this.projectileOffsets.get(shot.uid)!,blend=Math.max(0,1-(b.time-shot.born)/VIEW.projectileBlend);
      if(shot.kind!=='log'){p.x+=offset.x*blend;p.y+=offset.y*blend;}
      if(shot.kind==='arrow'){
        const piercing=(shot.maxHits??1)>1,angle=Math.atan2(-shot.vy,shot.vx),bolt=VIEW.ballistaBolt;
        if(piercing)g.lineStyle(3,VIEW.colors.gold,.6).lineBetween(p.x-Math.cos(angle)*bolt.trail,p.y-Math.sin(angle)*bolt.trail,p.x,p.y);
        sprite('shot-'+shot.uid,'FX/arrow',p.x,p.y,piercing?bolt.width:58,piercing?bolt.height:11).setFlipX(true).setRotation(angle);
      }
      else if(shot.kind==='poison')sprite('shot-'+shot.uid,'FX/poison-drop',p.x,p.y,18,29);
      else sprite('shot-'+shot.uid,'MX-B/M02-log',p.x,p.y+23,80,55).setRotation(b.time*Math.sign(shot.vx)*4);
    }
    for(const effect of b.effects){
      if(effect.hero){this.paintHeroSkill(effect);continue;}
      const p=this.screen(effect.floor,effect.x),t=1-effect.life/effect.maxLife;
      if(effect.kind==='boss'){
        g.lineStyle(12*(1-t),0xffc15b,1-t).strokeEllipse(p.x,p.y,VIEW.boss.shockRadius*t*2,VIEW.boss.shockRadius*t*.5);
        fx('boss-dust-'+effect.uid,'FX-dust',p.x,p.y,VIEW.boss.shockRadius*2,'play',t);
      }
      if(effect.kind==='promote'){
        fx('promote-'+effect.uid,'FX-repair',p.x,p.y,VIEW.effectSize*1.4,'play',t);
        this.worldLabels.show('promote-'+effect.uid,`升至 ${effect.value} 级`,p.x,p.y-130-t*50,'speech');
      }
      if(effect.kind==='steal')this.worldLabels.show('steal-'+effect.uid,`军饷 -${effect.value}`,p.x,p.y-130-t*50,'speech');
      const id=VIEW.effectArt[effect.kind];if(id)fx('effect-'+effect.uid,id,p.x,p.y,VIEW.effectSize,'play',t);
    }
    if(b.phase!=='select')for(const [key,entry] of Object.entries(LEVEL.entries)){
      const p=this.screen(entry.floor,entry.x),opened=entryOpen(entry,b.wave,b.waveTime);
      const warning=b.phase==='wave'&&b.wave===entry.wave&&b.waveTime<RULES.entryWarning&&key!=='A';
      if(warning)this.worldLabels.show('entry-'+key,`${key==='B'?'城门':'营地'}来敌 ${Math.ceil(RULES.entryWarning-b.waveTime)}秒`,p.x+(key==='B'?-100:100),p.y-110,'speech');
      if(opened)this.worldLabels.show('exit-'+key,entry.x===0?'← 撤离口':'撤离口 →',p.x+(entry.x===0?28:-42),p.y+40);
      else if(!warning)this.worldLabels.show('entry-closed-'+key,`第${entry.wave}关开放`,p.x+(entry.x===0?42:-42),p.y+22);
    }
    const boss=b.phase==='wave'?b.pending.find(spawn=>ENEMY[spawn.enemy].boss):undefined;
    if(boss&&boss.at-b.waveTime<=RULES.entryWarning){
      const entry=LEVEL.entries[boss.entry],p=this.screen(entry.floor,entry.x);
      this.worldLabels.show('boss-warning',`${ENEMY[boss.enemy].name}来袭 ${Math.ceil(boss.at-b.waveTime)}秒`,p.x+(entry.x===0?100:-100),p.y-110,'speech');
    }
    for(const [key,view] of this.fx)if(!usedFx.has(key)){view.destroy();this.fx.delete(key);}
    for(const [key,image] of this.sprites)if(!usedSprites.has(key)){image.destroy();this.sprites.delete(key);}
    const projectileIds=new Set(b.projectiles.map(shot=>shot.uid));for(const uid of this.projectileOffsets.keys())if(!projectileIds.has(uid))this.projectileOffsets.delete(uid);
    this.worldLabels.end();
  }

  private paintHeroSkill(effect:Effect){
    if(!effect.hero)return;
    const skill=HERO_SKILLS[effect.hero],p=this.screen(effect.floor,effect.x),g=this.graphics;
    const elapsed=effect.maxLife-effect.life,t=Math.min(1,elapsed/.85),fade=Math.max(0,1-t);
    const reach=skill.range*(VIEW.x1-VIEW.x0)/lastColumn,face=effect.facing||1;
    const viewport=this.cameras.main.worldView;
    const calloutX=Phaser.Math.Clamp(p.x+face*42,viewport.left+195,viewport.right-195);
    const calloutY=Phaser.Math.Clamp(p.y-VIEW.heroHeight-62,viewport.top+70,viewport.bottom-80);
    const label=this.worldLabels.show('hero-skill-'+effect.uid,`${skill.name}！\n${skill.line}`,calloutX,calloutY,'skill',skill.ink);
    label.setAlpha(Math.min(1,effect.life/.25)).setScale(1+Math.sin(Math.min(1,elapsed/.2)*Math.PI)*.08);
    if(fade<=0)return;
    if(effect.hero==='guanyu'){
      // Two sweeping crescents show the complete near-range cleave.
      for(const side of [-1,1]){
        const sweep=Math.min(1,t*3),outer:Phaser.Math.Vector2[]=[],inner:Phaser.Math.Vector2[]=[];
        for(let i=0;i<=24;i++){
          const angle=-1.35+i/24*2.7*sweep;
          outer.push(new Phaser.Math.Vector2(p.x+side*Math.cos(angle)*reach,p.y-72+Math.sin(angle)*88));
          inner.unshift(new Phaser.Math.Vector2(p.x+side*Math.cos(angle)*reach*.64,p.y-72+Math.sin(angle)*62));
        }
        g.fillStyle(skill.color,fade*.72).fillPoints([...outer,...inner],true);
        g.lineStyle(4,0xf1ffcb,fade).strokePoints(outer,false);
      }
    }else if(effect.hero==='zhangfei'){
      for(let ring=0;ring<3;ring++){
        const phase=Math.max(0,Math.min(1,t*1.7-ring*.2)),radius=reach*phase;
        g.lineStyle(9-ring*2,skill.color,fade*(1-phase)*.95).strokeEllipse(p.x,p.y-45,radius*2,radius);
      }
      for(let ray=0;ray<12;ray++){
        const angle=ray/12*Math.PI*2,inner=reach*(.35+t*.35),outer=inner+20*(1-t);
        g.lineStyle(4,0xffdf9d,fade).lineBetween(p.x+Math.cos(angle)*inner,p.y-50+Math.sin(angle)*inner*.5,p.x+Math.cos(angle)*outer,p.y-50+Math.sin(angle)*outer*.5);
      }
    }else{
      for(const side of [-1,1])for(let swirl=0;swirl<3;swirl++){
        const distance=reach*Math.min(1,t*1.5+swirl*.16),x=p.x+side*distance;
        const points:Phaser.Math.Vector2[]=[];
        for(let i=0;i<=36;i++){
          const height=i/36,angle=height*Math.PI*5-elapsed*13;
          points.push(new Phaser.Math.Vector2(x+Math.cos(angle)*(14+height*33),p.y-8-height*140+Math.sin(angle)*9));
        }
        g.lineStyle(9,skill.color,fade*.28).strokePoints(points,false);
        g.lineStyle(3,0xe9faff,fade*.9).strokePoints(points,false);
      }
    }
  }

  private paintIncome(){
    const camera=this.cameras.main,edge=VIEW.income.edge;
    this.ui.paintIncome((this.battle.active?this.battle.effects:[]).filter(effect=>effect.kind==='coin').map(effect=>{
      const p=this.screen(effect.floor,effect.x),origin=camera.matrixCombined.transformPoint(p.x,p.y-VIEW.income.lift);
      return {uid:effect.uid,value:effect.value!,progress:1-effect.life/effect.maxLife,
        x:Phaser.Math.Clamp(origin.x,camera.x+edge,camera.x+camera.width-edge),
        y:Phaser.Math.Clamp(origin.y,camera.y+edge,camera.y+camera.height-edge)};
    }));
  }
}
