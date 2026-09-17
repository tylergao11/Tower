import {ArtLibrary,artPhase} from '../art/runtime/art-player.js';
const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d',{alpha:false});
const loading=document.querySelector('#loading'),error=document.querySelector('#error'),controls=document.querySelector('#controls');
const objectSelect=document.querySelector('#object'),actionSelect=document.querySelector('#action'),phaseInput=document.querySelector('#phase');
const playButton=document.querySelector('#play'),caption=document.querySelector('#caption'),metrics=document.querySelector('#metrics');
let art,view='story',running=true,clock=0,last=0,facing=1,objectId='L01',action='idle',fpsFrames=0,fpsElapsed=0,drawTime=0,loadingVersion=0;
const phase=(duration=2.4,offset=0)=>(clock/duration+offset)%1;
const actorPhase=(id,action,offset=0)=>artPhase(art.manifest.objects[id].clips[action],clock,undefined,offset);
const atlasIdsForObject=id=>{const o=art.manifest.objects[id],ids=new Set();for(const n of Object.values(o.nodes))if(n.sprite)ids.add(art.manifest.sprites[n.sprite].atlas);for(const c of Object.values(o.clips))for(const track of Object.values(c.tracks??{}))for(const k of track)if(k.sprite)ids.add(art.manifest.sprites[k.sprite].atlas);return [...ids];};
function fail(e){error.hidden=false;error.textContent=e.message;loading.hidden=true;console.error(e);}
async function loadView(){
 const version=++loadingVersion;loading.hidden=false;controls.hidden=view!=='library';document.body.classList.toggle('library',view==='library');
 try{let ids;if(view==='story')ids=art.manifest.loadingGroups.intro;else if(view==='battle')ids=[...art.manifest.loadingGroups.battle,...art.manifest.scene.showcase.flatMap(o=>atlasIdsForObject(o.id))];else ids=atlasIdsForObject(objectId);
  art.releaseExcept(ids);await art.preload(ids);if(version!==loadingVersion)return;loading.hidden=true;error.hidden=true;
  canvas.dataset.view=view;
 }catch(e){fail(e);}
}
function drawSprite(id,x,y,w,h,extra={}){art.drawSprite(ctx,id,x,y,w,h,extra);}
function story(){const s=art.manifest.scene;drawSprite(s.intro.background,0,0,canvas.width,canvas.height,{pivot:[0,0]});
 for(const [i,d]of s.intro.dancers.entries())art.draw(ctx,'B05-dancer','dance',actorPhase('B05-dancer','dance',i*.4),{x:d[0],y:d[1],scale:d[2]});
 const [x,y,scale]=s.intro.lord;art.draw(ctx,'L01','idle',actorPhase('L01','idle'),{x,y,scale});
 caption.textContent='营帐 · 刘备观舞';
}
function battle(){const s=art.manifest.scene;drawSprite(s.background,0,0,canvas.width,canvas.height,{pivot:[0,0]});
 const centers=s.columnCenters,cell=(centers.end-centers.start)/(centers.count-1),at=c=>centers.start+cell*c;
 art.draw(ctx,'B03-gate','open',phase(5),{x:1495,y:s.laneBaselines[1],scale:.49});
 art.draw(ctx,'B03-barrier','open',phase(5,.5),{x:135,y:s.laneBaselines[2],scale:.3});
 for(const [i,o]of s.showcase.entries()){
  const object=art.manifest.objects[o.id];const size=object.kind==='character'?.35:.34;
  const y=s.laneBaselines[o.floor]-(o.elevated?68:0);
  art.draw(ctx,o.id,o.action,phase(2.5,i*.085),{x:at(o.column-1),y,scale:size,facing:o.facing??1});
 }
 const lx=1520,ly=s.laneBaselines[2];art.draw(ctx,'L01','idle',phase(3),{x:lx,y:ly,scale:.31});
 caption.textContent='新野城防 · 场景、挂点与机关动作';
}
function library(){ctx.fillStyle='#211d18';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#c4b58822';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,790);ctx.lineTo(canvas.width,790);ctx.stroke();
 const o=art.manifest.objects[objectId],p=running?artPhase(o.clips[action],clock):Number(phaseInput.value)/1000;
 if(running)phaseInput.value=Math.round(p*1000);
 const hiddenSlots=document.querySelector('#shield').checked?[]:o.shieldSlots??[];
 const pose=art.draw(ctx,objectId,action,p,{x:document.querySelector('#parts').checked?480:836,y:790,scale:1.35,facing,hiddenSlots,variant:document.querySelector('#shield').checked?undefined:'unshielded'});
 if(document.querySelector('#parts').checked){let i=0;for(const layer of pose.layers){const x=1010+(i%3)*190,y=170+Math.floor(i/3)*190;const ratio=layer.width/layer.height;const w=ratio>1?140:140*ratio,h=ratio>1?140/ratio:140;drawSprite(layer.sprite,x,y,w,h);ctx.fillStyle='#d7c9a8';ctx.font='17px system-ui';ctx.textAlign='center';ctx.fillText(layer.slot,x,y+90);i++;}}
 caption.textContent=o.name+' · '+(art.manifest.actionLabels[action]??action);canvas.dataset.object=objectId;canvas.dataset.action=action;canvas.dataset.phase=p.toFixed(4);
}
function updateActions(){const o=art.manifest.objects[objectId];actionSelect.replaceChildren(...Object.keys(o.clips).map(key=>new Option(art.manifest.actionLabels[key]??key,key)));action=Object.keys(o.clips)[0];actionSelect.value=action;clock=0;}
function tick(now){requestAnimationFrame(tick);const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(document.hidden||!art||!loading.hidden)return;
 if(running)clock+=dt;const start=performance.now();try{if(view==='story')story();else if(view==='battle')battle();else library();}catch(e){fail(e);return;}drawTime+=performance.now()-start;fpsFrames++;fpsElapsed+=dt;
 if(fpsElapsed>1){const files=[...art.images.keys()].map(k=>art.manifest.files[k]),bytes=files.reduce((n,f)=>n+f.bytes,0),decoded=files.reduce((n,f)=>n+f.width*f.height*4,0);const fps=Math.round(fpsFrames/fpsElapsed),draw=drawTime/fpsFrames;metrics.textContent=`当前画面 ${(bytes/1024).toFixed(0)} KB · 纹理 ${(decoded/1048576).toFixed(1)} MB · ${fps} FPS`;canvas.dataset.fps=String(fps);canvas.dataset.drawMs=draw.toFixed(2);canvas.dataset.loadedBytes=String(bytes);canvas.dataset.textureBytes=String(decoded);fpsFrames=0;fpsElapsed=0;drawTime=0;}
}
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{view=button.dataset.view;for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b===button));loadView();});
playButton.addEventListener('click',()=>{running=!running;if(running&&view==='library'){const clip=art.manifest.objects[objectId].clips[action];const p=Number(phaseInput.value)/1000;clock=(p>=1?0:p)*(clip.duration??1);}playButton.textContent=running?'暂停':'播放';});
objectSelect.addEventListener('change',()=>{objectId=objectSelect.value;updateActions();phaseInput.value=0;loadView();});actionSelect.addEventListener('change',()=>{action=actionSelect.value;clock=0;phaseInput.value=0;});
phaseInput.addEventListener('input',()=>{running=false;playButton.textContent='播放';});document.querySelector('#flip').addEventListener('click',()=>{facing*=-1;});
try{art=await ArtLibrary.load('../assets/game/asset-manifest.json');objectSelect.replaceChildren(...Object.values(art.manifest.objects).sort((a,b)=>a.id==='L01'?-1:b.id==='L01'?1:a.id.localeCompare(b.id)).map(o=>new Option(o.name+' · '+o.id,o.id)));objectSelect.value=objectId;updateActions();await loadView();requestAnimationFrame(tick);}catch(e){fail(e);}
