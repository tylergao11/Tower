const RAD = Math.PI / 180;
const numeric = ['x','y','rotation','scaleX','scaleY','alpha','width','height'];
const identity = [1,0,0,1,0,0];
function jointPoint(manifest,node,name) {
  const point=manifest.sprites[node.sprite]?.joints?.[name];
  if(!point)throw new Error(`Missing art joint: ${node.sprite}/${name}`);
  return [(point[0]-node.pivot[0])*node.width,(point[1]-node.pivot[1])*node.height];
}
function transformPoint(m,p){return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
function multiply(a,b) { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; }
function matrix(p) { const c=Math.cos(p.rotation*RAD),s=Math.sin(p.rotation*RAD);return [c*p.scaleX,s*p.scaleX,-s*p.scaleY,c*p.scaleY,p.x,p.y]; }
function frameAt(track, phase, base) {
  if (!track?.length) return {};
  const complete=key=>({...base,...key});
  if (phase<=track[0].t) return complete(track[0]);
  for (let i=1;i<track.length;i++) if(phase<=track[i].t) {
    const a=complete(track[i-1]),b=complete(track[i]),q=(phase-a.t)/(b.t-a.t);
    if(a.hold && q<1)return a;
    const v={...a};
    for (const key of numeric) {
      // A replacement drawing has its own aspect and pivot. Do not stretch the old
      // drawing into the new one's rectangle before the sprite actually switches.
      if(a.sprite!==b.sprite&&(key==='width'||key==='height'))continue;
      if(a.sprite!==b.sprite&&(key==='scaleX'||key==='scaleY')&&Math.sign(a[key])!==Math.sign(b[key]))continue;
      if(typeof a[key]==='number'&&typeof b[key]==='number')v[key]=a[key]+(b[key]-a[key])*q;
    }
    if(q===1) return {...v,...b};
    return v;
  }
  return complete(track.at(-1));
}

export function artPhase(clip, elapsed, duration=clip.duration??1, offset=0) {
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Art duration must be positive');
  const phase=elapsed/duration+offset;
  return clip.loop?((phase%1)+1)%1:Math.max(0,Math.min(1,phase));
}

/** No game rules: phase is supplied by the caller, and all art data comes from the manifest. */
export function sampleArt(manifest, objectId, action, phase, options={}) {
  const object=manifest.objects[objectId];
  if(!object) throw new Error(`Unknown art object: ${objectId}`);
  const clip=object.clips[action];
  if(!clip) throw new Error(`Unknown art action: ${objectId}/${action}`);
  phase=Math.max(0,Math.min(1,phase));
  const nodes={};
  for(const [name,base] of Object.entries(object.nodes)) {
    const defaults={x:0,y:0,rotation:0,scaleX:1,scaleY:1,alpha:1,z:0,pivot:[.5,.5],...base};
    nodes[name]={...defaults,...frameAt(clip.tracks?.[name],phase,defaults)};
    const replacement=object.variants?.[options.variant]?.[nodes[name].sprite];
    if(replacement)nodes[name].sprite=replacement;
  }
  for(const name of options.hiddenSlots??[]) if(nodes[name]) nodes[name].alpha=0;
  const offsets=Object.fromEntries(Object.entries(nodes).map(([name,n])=>[name,[n.x,n.y]]));
  const transforms={},chains={},alphas={};
  const visiting=new Set();
  function world(name) {
    if(transforms[name]) return transforms[name];
    if(visiting.has(name)) throw new Error('Art parent cycle: '+name);
    visiting.add(name);
    const node=nodes[name];
    if(!node)throw new Error(`Missing art parent: ${objectId}/${name}`);
    const parent=node.parent?world(node.parent):identity;
    if(node.socket){const p=jointPoint(manifest,nodes[node.parent],node.socket);node.x=offsets[name][0]+p[0];node.y=offsets[name][1]+p[1];}
    const result=multiply(parent,matrix(node));
    chains[name]=[...(node.parent?chains[node.parent]:[]),node];
    alphas[name]=(node.parent?alphas[node.parent]:1)*node.alpha;
    visiting.delete(name);return transforms[name]=result;
  }
  // Grip constraints use each drawing's own joints. The support hand follows the
  // weapon after interpolation, so contact is preserved between authored poses.
  for(const c of object.constraints??[]){
    if(c.visibleWith){world(c.visibleWith);if(alphas[c.visibleWith]<=0)continue;}
    const driven=nodes[c.node],target=nodes[c.target];
    const destination=transformPoint(world(c.target),c.targetSocket?jointPoint(manifest,target,c.targetSocket):[c.x??0,c.y??0]);
    const parent=driven.parent?world(driven.parent):identity;
    const det=parent[0]*parent[3]-parent[1]*parent[2];
    if(Math.abs(det)<1e-8)continue;
    const x=destination[0]-parent[4],y=destination[1]-parent[5];
    const dx=(parent[3]*x-parent[2]*y)/det-driven.x,dy=(-parent[1]*x+parent[0]*y)/det-driven.y;
    const from=jointPoint(manifest,driven,c.socket),length=Math.hypot(...from);
    if(length<=0)throw new Error('Grip coincides with arm mount: '+objectId+'/'+c.node);
    driven.rotation=(Math.atan2(dy,dx)-Math.atan2(from[1],from[0]))/RAD;
    driven.scaleX=driven.scaleY=Math.hypot(dx,dy)/length;
    for(const cache of [transforms,chains,alphas])for(const key of Object.keys(cache))delete cache[key];
  }
  // Keep invisible slots so both renderers can restore them on the next pose.
  const layers=Object.entries(nodes).filter(([,p])=>p.sprite).sort((a,b)=>a[1].z-b[1].z).map(([slot,p])=>({slot,...p,matrix:world(slot),chain:chains[slot],alpha:alphas[slot]}));
  const attachments={};
  for(const [name,a] of Object.entries(object.attachments??{})) {
    const m=a.parent?world(a.parent):identity;
    attachments[name]=transformPoint(m,a.socket?jointPoint(manifest,nodes[a.parent],a.socket):[a.x,a.y]);
  }
  return {layers,attachments,anchor:object.anchor,events:clip.events??[],loop:clip.loop??false};
}

export class ArtLibrary {
  constructor(manifest, baseURL) { this.manifest=manifest;this.baseURL=baseURL;this.images=new Map();this.pending=new Map(); }
  static async load(manifestURL) { const url=new URL(manifestURL,location.href);const response=await fetch(url);if(!response.ok)throw new Error('Cannot load art manifest');return new ArtLibrary(await response.json(),new URL('../../',url)); }
  async preload(atlasIds) {
    return Promise.all([...new Set(atlasIds)].map(id=>{
      if(this.images.has(id)) return this.images.get(id);
      if(this.pending.has(id))return this.pending.get(id);
      const file=this.manifest.files[id];if(!file)throw new Error('Missing atlas: '+id);
      const task=(async()=>{try{const url=new URL(file.path,this.baseURL);if(file.sha256)url.searchParams.set('v',file.sha256.slice(0,12));const r=await fetch(url);if(!r.ok)throw new Error('Missing art file: '+file.path);const bitmap=await createImageBitmap(await r.blob());this.images.set(id,bitmap);return bitmap;}finally{this.pending.delete(id);}})();
      this.pending.set(id,task);return task;
    }));
  }
  async preloadObjects(ids) {
    const atlases=new Set();
    for(const id of ids) {const object=this.manifest.objects[id];if(!object)throw new Error('Missing art object: '+id);for(const node of Object.values(object.nodes))if(node.sprite)atlases.add(this.manifest.sprites[node.sprite].atlas);for(const clip of Object.values(object.clips))for(const track of Object.values(clip.tracks??{}))for(const key of track)if(key.sprite)atlases.add(this.manifest.sprites[key.sprite].atlas);}
    await this.preload([...atlases]);
  }
  releaseExcept(atlasIds) {const keep=new Set(atlasIds);for(const [id,image]of this.images)if(!keep.has(id)){image.close();this.images.delete(id);} }
  drawSprite(ctx,id,x,y,width,height,options={}) {
    const s=this.manifest.sprites[id];if(!s)throw new Error('Missing sprite: '+id);
    const image=this.images.get(s.atlas);if(!image)throw new Error('Atlas not loaded: '+s.atlas);
    const [sx,sy,sw,sh]=s.rect;
    ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.translate(x,y);ctx.rotate((options.rotation??0)*RAD);ctx.scale(options.scaleX??1,options.scaleY??1);
    const pivot=options.pivot??[.5,.5];ctx.drawImage(image,sx,sy,sw,sh,-pivot[0]*width,-pivot[1]*height,width,height);ctx.restore();
  }
  draw(ctx,id,action,phase,{x=0,y=0,scale=1,facing=1,...options}={}) {
    const pose=sampleArt(this.manifest,id,action,phase,options);
    const anchor=options.anchorName?pose.attachments[options.anchorName]:pose.anchor;
    if(!anchor)throw new Error('Unknown attachment: '+options.anchorName);
    ctx.save();ctx.translate(x,y);ctx.scale(scale*facing,scale);ctx.translate(-anchor[0],-anchor[1]);
    for(const layer of pose.layers){ctx.save();ctx.transform(...layer.matrix);this.drawSprite(ctx,layer.sprite,0,0,layer.width,layer.height,{alpha:layer.alpha,pivot:layer.pivot});ctx.restore();}
    ctx.restore();return pose;
  }
}

/** Emits each authored event once when time crosses it; the caller owns state changes. */
export function crossedArtEvents(clip, previousPhase, phase) {return (clip.events??[]).filter(e=>e.t>previousPhase&&e.t<=phase);}
