import Phaser from 'phaser';
import { VIEW } from '../config';
import { ActorView, manifest } from './art';

/** The opening shares the production atlases and animation player with combat. */
export class Opening {
  private root:Phaser.GameObjects.Container;
  private actors:Array<{view:ActorView;action:string;offset:number}>=[];
  private overlay:HTMLElement;
  private elapsed=0;
  private finished=false;
  paused=false;

  constructor(private scene:Phaser.Scene,private onComplete:()=>void) {
    const layout=manifest.scene.intro,artCanvas=manifest.scene.canvas;
    const scaleX=VIEW.width/artCanvas[0],scaleY=VIEW.height/artCanvas[1];
    this.root=scene.add.container(0,0).setDepth(VIEW.intro.depth);
    this.root.add(scene.add.image(0,0,layout.background).setOrigin(0,0).setDisplaySize(VIEW.width,VIEW.height));
    const add=(id:string,at:[number,number,number],action:string,offset=0)=>{
      const view=new ActorView(scene,id,manifest.objects[id].canvas[1]*at[2]*scaleY);
      view.root.setPosition(at[0]*scaleX,at[1]*scaleY);this.root.add(view.root);
      this.actors.push({view,action,offset});view.update(action,0,1,0,{phaseOffset:offset});
    };
    // Rear dancer, seat, and Liu Bei are sorted by their actual floor positions.
    const dancers=[...layout.dancers].sort((a,b)=>a[1]-b[1]);
    for(const [index,at] of dancers.entries())add('B05-dancer',at,'dance',index*VIEW.intro.danceOffset);
    add('B05-chair',layout.chair,'idle');add('L01',layout.lord,'idle');
    this.overlay=document.createElement('div');this.overlay.className='opening-ui';
    this.overlay.innerHTML=`<div class="opening-dialogue" role="status"><small>刘备</small><p>${VIEW.intro.line}</p></div><button class="opening-skip">进入战场</button>`;
    document.getElementById('stage')!.append(this.overlay);
    this.overlay.querySelector('button')!.addEventListener('click',()=>{this.elapsed=Math.max(this.elapsed,VIEW.intro.hold);});
    const head=this.actors.at(-1)!.view.attachment('head');
    if(head){const bubble=this.overlay.querySelector<HTMLElement>('.opening-dialogue')!;bubble.style.width=`${VIEW.intro.bubbleWidth}px`;bubble.style.left=`${Math.min(VIEW.width-VIEW.intro.bubbleWidth-30,Math.max(30,head.x-VIEW.intro.bubbleWidth/2))}px`;bubble.style.top=`${Math.max(55,head.y-VIEW.intro.bubbleGap)}px`;}
  }

  update(seconds:number) {
    if(this.finished||this.paused||document.hidden)return;
    this.elapsed+=seconds;
    for(const actor of this.actors)actor.view.update(actor.action,this.elapsed,1,0,{phaseOffset:actor.offset});
    this.overlay.classList.toggle('speaking',this.elapsed>=VIEW.intro.dialogueAt);
    this.overlay.classList.toggle('can-skip',this.elapsed>=VIEW.intro.skipAt);
    const progress=Phaser.Math.Clamp((this.elapsed-VIEW.intro.hold)/VIEW.intro.transition,0,1);
    const eased=progress*progress*(3-2*progress);
    this.root.y=-VIEW.height*VIEW.intro.panDistance*eased;this.root.alpha=1-eased;
    this.overlay.style.opacity=String(1-eased);
    if(progress>=1){this.finished=true;this.destroy();this.onComplete();}
  }
  destroy(){this.root.destroy(true);this.overlay.remove();}
}
