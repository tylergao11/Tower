import Phaser from 'phaser';
import rawManifest from '../../assets/game/asset-manifest.json';
import { CARDS, RULES, VIEW } from '../config';
import { sampleArt, artPhase, type ArtObject, type ArtPose } from '../../art/runtime/art-player.js';
export const manifest=rawManifest as unknown as {
  files:Record<string,{path:string;width:number;height:number;bytes:number;sha256:string;cols?:number;rows?:number}>;
  sprites:Record<string,{atlas:string;rect:number[];anchor?:number[];joints?:Record<string,[number,number]>}>;
  objects:Record<string,ArtObject>;
  bindings:Record<string,{sprites?:string[];object?:string;defaultAction?:string;cardPose?:{action:string;phase:number}}>;
  scene:{canvas:[number,number];floorModule:string;floorFront:string;beam:string;post:string;stairs:Record<string,{sprite:string;rect:number[]}>;intro:{background:string;lord:[number,number,number];chair:[number,number,number];dancers:Array<[number,number,number]>}};
  loadingGroups:Record<string,string[]>;
};
const previews=new Map<string,string>();
export function previewFor(id:string) { return previews.get(id)||''; }

function tightPreview(canvas:HTMLCanvasElement) {
  const context=canvas.getContext('2d')!,pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  let left=canvas.width,top=canvas.height,right=0,bottom=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const result=document.createElement('canvas');result.width=result.height=256;
  const width=Math.max(1,right-left+1),height=Math.max(1,bottom-top+1),scale=232/Math.max(width,height);
  result.getContext('2d')!.drawImage(canvas,left,top,width,height,(256-width*scale)/2,(256-height*scale)/2,width*scale,height*scale);
  return result.toDataURL();
}

// UI images use the same layered pose and atlas rectangles as the battlefield.
export function installPreviews(scene:Phaser.Scene) {
  const crop=(name:string)=>{
    const sp=manifest.sprites[name],canvas=document.createElement('canvas');canvas.width=sp.rect[2];canvas.height=sp.rect[3];
    canvas.getContext('2d')!.drawImage(scene.textures.get(sp.atlas).getSourceImage() as HTMLImageElement,sp.rect[0],sp.rect[1],sp.rect[2],sp.rect[3],0,0,canvas.width,canvas.height);
    previews.set(name,canvas.toDataURL());
  };
  for(const key of Object.keys(manifest.sprites))if(key.startsWith('UI-'))crop(key);
  for(const card of CARDS){
    const art=manifest.objects[card.id],pose=manifest.bindings[card.id].cardPose||{action:'idle',phase:0};
    if(!art)throw new Error(`Missing art object: ${card.id}`);
    const canvas=document.createElement('canvas');canvas.width=art.canvas[0];canvas.height=art.canvas[1];
    const context=canvas.getContext('2d')!;
    for(const node of sampleArt(manifest,art.id,pose.action,pose.phase).layers){
      const sp=manifest.sprites[node.sprite];
      context.save();
      context.transform(...node.matrix);
      context.globalAlpha=node.alpha??1;
      context.drawImage(scene.textures.get(sp.atlas).getSourceImage() as HTMLImageElement,sp.rect[0],sp.rect[1],sp.rect[2],sp.rect[3],-node.width*node.pivot[0],-node.height*node.pivot[1],node.width,node.height);
      context.restore();
    }
    previews.set(card.id,tightPreview(canvas));
  }
  for(const name of ['card','panel','gold-button','ivory-button','hud-bar','warning-bar'])document.documentElement.style.setProperty('--art-'+name,`url("${previewFor('UI-PANELS/'+name)}")`);
}
export function preloadArt(scene:Phaser.Scene) {for(const [key,file] of Object.entries(manifest.files))if(!scene.textures.exists(key))scene.load.image(key,`${file.path}?v=${file.sha256.slice(0,12)}`);}
export function installFrames(scene:Phaser.Scene) {
  for(const [name,sprite] of Object.entries(manifest.sprites)){
    const [x,y,w,h]=sprite.rect;scene.textures.get(sprite.atlas).add(name,0,x,y,w,h);
  }
}
export function spriteFor(id:string) {
  const name=manifest.bindings[id]?.sprites?.[0]||Object.keys(manifest.sprites).find(key=>key===id+'/reference'||key.endsWith('/'+id+'-base')||key.endsWith('/'+id+'-frame'));
  const sprite=name?manifest.sprites[name]:undefined;
  return sprite?{texture:sprite.atlas,frame:name!,originY:.95}:undefined;
}

export class ActorView {
  readonly root:Phaser.GameObjects.Container;
  private art?:ArtObject;
  private nodes=new Map<string,{container:Phaser.GameObjects.Container;transforms:Phaser.GameObjects.Container[];image:Phaser.GameObjects.Image}>();
  private pose?:ArtPose;
  private current='';
  private since=0;
  private scale:number;
  private id:string;
  constructor(scene:Phaser.Scene,id:string,height=VIEW.actorHeight){
    this.id=id;this.root=scene.add.container(0,0);this.art=manifest.objects?.[manifest.bindings[id]?.object||id];
    this.scale=height/(this.art?.canvas[1]||height);
    if(this.art){
      for(const node of sampleArt(manifest,this.art.id,manifest.bindings[id]?.defaultAction||'idle',0).layers){
        const sprite=manifest.sprites[node.sprite];
        const container=scene.add.container(-this.art.anchor[0],-this.art.anchor[1]);
        const image=scene.add.image(0,0,sprite.atlas,node.sprite),transforms:Phaser.GameObjects.Container[]=[];
        let parent=container;
        for(const _part of node.chain){const transform=scene.add.container(0,0);parent.add(transform);transforms.push(transform);parent=transform;}
        parent.add(image);this.root.add(container);this.nodes.set(node.slot,{container,transforms,image});
      }
    }else throw new Error(`Missing art object: ${id}`);
  }

  update(action:string,time:number,facing:number,hit=0,options:{shield?:boolean;progress?:number;duration?:number;phaseOffset?:number}={}) {
    if(action!==this.current||time<this.since){this.current=action;this.since=time;}
    this.root.setScale(this.scale*(facing<0?-1:1),this.scale);
    if(!this.art)return;
    const clip=this.art.clips[action];
    if(!clip)throw new Error(`Missing art action: ${this.id}/${action}`);
    const duration=options.duration??clip.duration??(action==='grab'?RULES.captureTime:action==='dead'?RULES.enemyDeathDuration:action==='attack'||action==='heal'?RULES.attackPoseTime:action==='fall'?RULES.dropTime:action==='hit'||action==='carry-hit'?RULES.hitFlash:1);
    const t=options.progress??artPhase(clip,time-this.since,duration,options.phaseOffset);
    this.pose=sampleArt(manifest,this.art.id,action,t,{hiddenSlots:options.shield===false?this.art.shieldSlots:undefined});
    for(const state of this.pose.layers){
      const view=this.nodes.get(state.slot)!;
      const sprite=manifest.sprites[state.sprite];
      view.image.setTexture(sprite.atlas,state.sprite).setOrigin(...state.pivot).setDisplaySize(state.width,state.height);
      state.chain.forEach((part,index)=>view.transforms[index].setPosition(part.x,part.y).setAngle(part.rotation||0).setScale(part.scaleX??1,part.scaleY??1));
      view.container.setAlpha(state.alpha??1).setDepth(state.z);
      if(hit>0)view.image.setTint(0xffa08b);else view.image.clearTint();
    }
    this.root.sort('depth');
  }
  attachment(name:string){
    const point=this.pose?.attachments[name];if(!point||!this.art)return undefined;
    return this.root.getWorldTransformMatrix().transformPoint(point[0]-this.art.anchor[0],point[1]-this.art.anchor[1]);
  }
  alignAttachment(name:string,x:number,y:number) {
    const point=this.attachment(name);if(!point)return;
    this.root.x+=x-point.x;this.root.y+=y-point.y;
  }
  eventPhase(action:string,event:string) {return this.art?.clips[action]?.events?.find(key=>key.event===event)?.t;}
  hasAction(action:string){return !!this.art?.clips[action];}
  get bounds(){return this.root.getBounds();}
  destroy(){this.root.destroy(true);}
}
