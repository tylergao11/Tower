import Phaser from 'phaser';
import { VIEW } from '../config';
import { ActorView, manifest } from './art';
import { LoadingScreen } from '../loading';

/** The opening shares the production atlases and animation player with combat. */
export class Opening {
  private root:Phaser.GameObjects.Container;
  private actors:Array<{view:ActorView;action:string;offset:number}>=[];
  private overlay:HTMLElement;
  private elapsed=0;
  private finished=false;
  private ready=false;
  private entering=false;
  private transitionElapsed=0;
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
      return view;
    };
    // Rear dancer, seat, and Liu Bei are sorted by their actual floor positions.
    const dancers=[...layout.dancers].sort((a,b)=>a[1]-b[1]);
    for(const [index,at] of dancers.entries())add('B05-dancer',at,'dance',index*VIEW.intro.danceOffset);
    const lord=add('L01',layout.lord,'idle');
    // Bring the bubble closer to the seated figure within the pose's transparent top margin.
    const bubbleTop=Math.max(24,lord.bounds.top-VIEW.intro.bubbleHeight-VIEW.intro.bubbleGap+VIEW.intro.bubbleOffsetY);
    this.overlay=document.createElement('div');this.overlay.className='opening-ui';
    this.overlay.innerHTML=`<div class="opening-dialogue" style="left:${layout.lord[0]*scaleX-180}px;top:${bubbleTop}px;width:${VIEW.intro.bubbleWidth}px;height:${VIEW.intro.bubbleHeight}px"><span>${VIEW.intro.line.replace('，','，<br>')}</span></div>`;
    document.getElementById('stage')!.append(this.overlay);
    LoadingScreen.mountInCamp(this.overlay,()=>{if(this.ready&&!this.entering)this.entering=true;});
  }

  setReady(){this.ready=true;LoadingScreen.finish();}

  update(seconds:number) {
    if(this.finished||this.paused||document.hidden)return;
    this.elapsed+=seconds;
    for(const actor of this.actors)actor.view.update(actor.action,this.elapsed,1,0,{phaseOffset:actor.offset});
    this.overlay.classList.toggle('show-dialogue',this.elapsed>=VIEW.intro.dialogueAt);
    if(!this.entering)return;
    this.transitionElapsed+=seconds;
    const progress=Phaser.Math.Clamp(this.transitionElapsed/VIEW.intro.transition,0,1);
    const eased=progress*progress*(3-2*progress);
    this.root.y=-VIEW.height*VIEW.intro.panDistance*eased;this.root.alpha=1-eased;
    this.overlay.style.opacity=String(1-eased);
    if(progress>=1){this.finished=true;this.destroy();this.onComplete();}
  }
  destroy(){this.root.destroy(true);this.overlay.remove();}
}
