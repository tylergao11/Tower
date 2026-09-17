import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Extract complete silhouettes, including drawings that extend beyond the nominal
// grid. Every pose uses one sheet-wide scale; crouching poses stay shorter.
async function packCharacter(root, job) {
  const source = await fs.readFile(path.join(root, job.source));
  const sourceHash = hash(source);
  const cachePath = path.join(root, `art/cache/characters/${job.id}.json`);
  const settingsHash = hash(JSON.stringify({version:2,grid:job.grid,cells:job.cells,size:job.frameSize??192,quality:job.quality??82,kind:job.kind}));
  try {
    const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    if (cached.sourceHash === sourceHash && cached.settingsHash === settingsHash) {
      const bytes = await fs.readFile(path.join(root, cached.file.path));
      if (hash(bytes) === cached.file.sha256) return cached;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const meta = await sharp(source).metadata();
  if (!meta.hasAlpha) throw new Error(`${job.id}: character sheet needs genuine alpha`);
  const {data,info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const count = info.width * info.height, labels = new Int32Array(count), queue = new Int32Array(count), pieces=[];
  for (let seed=0;seed<count;seed++) {
    if (labels[seed] || data[seed*4+3]<12) continue;
    const piece={id:pieces.length+1,count:0,sx:0,sy:0,left:info.width,top:info.height,right:0,bottom:0};
    let first=0,last=1;queue[0]=seed;labels[seed]=piece.id;
    while(first<last) {
      const p=queue[first++],x=p%info.width,y=Math.floor(p/info.width);
      piece.count++;piece.sx+=x;piece.sy+=y;piece.left=Math.min(piece.left,x);piece.top=Math.min(piece.top,y);piece.right=Math.max(piece.right,x);piece.bottom=Math.max(piece.bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy,np=ny*info.width+nx;
        if(nx<0||nx>=info.width||ny<0||ny>=info.height||labels[np]||data[np*4+3]<12)continue;
        labels[np]=piece.id;queue[last++]=np;
      }
    }
    piece.cx=piece.sx/piece.count;piece.cy=piece.sy/piece.count;pieces.push(piece);
  }
  const [cols,rows]=job.grid, main=pieces.filter(p=>p.count>count/job.cells.length*.09);
  if(main.length!==job.cells.length)throw new Error(`${job.id}: expected ${job.cells.length} complete figures, found ${main.length}`);
  main.sort((a,b)=>Math.floor(a.cy/info.height*rows)-Math.floor(b.cy/info.height*rows)||a.cx-b.cx);
  const groups=main.map((p,index)=>({...p,index,pieces:[]}));
  const owner=new Map();
  for(const p of pieces) {
    if(p.count<6)continue;
    const own=groups.find(g=>g.id===p.id)??groups.reduce((best,g)=>{
      const distance=q=>Math.hypot(Math.max(q.left-p.cx,0,p.cx-q.right),Math.max(q.top-p.cy,0,p.cy-q.bottom));
      return distance(g)<distance(best)?g:best;
    });
    owner.set(p.id,own.index);own.pieces.push(p.id);own.left=Math.min(own.left,p.left);own.top=Math.min(own.top,p.top);own.right=Math.max(own.right,p.right);own.bottom=Math.max(own.bottom,p.bottom);
  }
  const commonScale=Math.min(472/Math.max(...groups.map(g=>g.right-g.left+1)),450/Math.max(...groups.map(g=>g.bottom-g.top+1)));
  const frameSize=job.frameSize??192, layers=[],sprites={},bounds={};
  for(let i=0;i<groups.length;i++) {
    const g=groups[i],w=g.right-g.left+1,h=g.bottom-g.top+1,pixels=Buffer.alloc(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const p=(g.top+y)*info.width+g.left+x;
      if(owner.get(labels[p])===i)data.copy(pixels,(y*w+x)*4,p*4,p*4+4);
    }
    const width=Math.max(1,Math.round(w*commonScale)),height=Math.max(1,Math.round(h*commonScale));
    const airborne=job.kind==='lord'&&job.cells[i].startsWith('carried');
    const left=Math.round((512-width)/2),top=airborne?Math.round(265-height/2):486-height;
    const part=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).resize(width,height).png().toBuffer();
    const fullFrame=await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input:part,left,top}]).png().toBuffer();
    const frame=await sharp(fullFrame).resize(frameSize,frameSize).png().toBuffer();
    const x=i%cols*frameSize,y=Math.floor(i/cols)*frameSize,key=`${job.id}/${job.cells[i]}`;
    layers.push({input:frame,left:x,top:y});
    // Whole-figure contact points keep carried characters and beam grips aligned
    // during the small squash/bounce animation; these are not limb joints.
    sprites[key]={atlas:job.id,rect:[x,y,frameSize,frameSize],sourceSize:[512,512],joints:{carry:[.5,(top+16)/512],grip:[.5,(top+8)/512],carried:[.5,265/512]}};
    bounds[job.cells[i]]={source:[g.left,g.top,w,h],normalized:[left,top,width,height]};
  }
  const width=cols*frameSize,height=rows*frameSize;
  const bytes=await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(layers).webp({quality:job.quality??82,alphaQuality:100,effort:6}).toBuffer();
  const relative=`assets/game/characters/${job.id.toLowerCase()}.webp`;
  await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});
  await fs.mkdir(path.dirname(cachePath),{recursive:true});
  await fs.writeFile(path.join(root,relative),bytes);
  const result={sourceHash,settingsHash,file:{path:relative,width,height,bytes:bytes.length,sha256:hash(bytes),hasAlpha:true,source:job.source},sprites,bounds,commonScale};
  await fs.writeFile(cachePath,JSON.stringify(result,null,2)+'\n','utf8');
  return result;
}

function characterObject(job) {
  const aliases=job.kind==='shield'?{windup:'block',grab:'carry-a',fall:'hit'}:job.kind==='hero'?{grab:'skill-windup','carry-a':'skill','carry-b':'proud'}:job.kind==='guard'?{grab:'block','carry-a':'shove','carry-b':'brace'}:job.kind==='medic'?{windup:'heal-windup',strike:'heal',grab:'repair','carry-a':'self-heal','carry-b':'cheer'}:{};
  const sprite=name=>`${job.id}/${aliases[name]??name}`,first=job.cells[0];
  const o={id:job.id,name:job.name,kind:'character',animation:'whole-body-key-poses',canvas:[512,512],anchor:[256,486],nodes:{figure:{sprite:sprite(first),x:256,y:486,width:512,height:512,z:0,pivot:[.5,1],rotation:0,scaleX:1,scaleY:1,alpha:1}},attachments:{foot:{x:256,y:486},hit:{x:256,y:285},head:{x:256,y:160},weapon:{x:400,y:280},muzzle:{x:405,y:280},carry:{x:270,y:160},carried:{x:256,y:265},grip:{x:256,y:45}},clips:{}};
  o.nodes.figure.pivot=[.5,486/512];
  for(const name of ['carry','carried','grip'])o.attachments[name]={parent:'figure',socket:name};
  if(job.kind==='lord')o.attachments.carried={parent:'figure',x:-26,y:325-486};
  const sequence=(name,poses,{loop=false,duration=1,events=[],bounce=0,squash=0,rotation=0}={})=>{
    const tracks=poses.map((pose,i)=>{const t=i/Math.max(1,poses.length-1);return {t,sprite:sprite(pose),width:512,height:512,pivot:[.5,486/512],x:256,y:486-Math.sin(t*Math.PI*2)**2*bounce,scaleX:1+Math.sin(t*Math.PI*2)*squash,scaleY:1-Math.sin(t*Math.PI*2)*squash,rotation:Math.sin(t*Math.PI*2)*rotation};});
    o.clips[name]={loop,duration,tracks:{figure:tracks},events};
  };
  if(job.kind==='dancer') {
    sequence('dance',[...job.cells,job.cells[0]],{loop:true,duration:1.8,events:[{t:0,event:'step'},{t:.5,event:'turn'}]});
    o.clips.idle=structuredClone(o.clips.dance);
  } else if(job.kind==='lord') {
    sequence('idle',['idle-a','idle-a','idle-b','idle-b','idle-a'],{loop:true,duration:2.8});
    sequence('grab',['idle-a','alarm','alarm','carried-a'],{events:[{t:1,event:'lift-ready',attachment:'carried'}],squash:.035});
    sequence('struggle',['carried-a','carried-b','carried-a','carried-b','carried-a'],{loop:true,duration:.9,rotation:5});
    sequence('fall',['carried-a','landing','crouch-a'],{events:[{t:.65,event:'land',attachment:'foot'}]});
    sequence('crouch',['crouch-a','crouch-a','crouch-b','crouch-b','crouch-a'],{loop:true,duration:1.1,squash:.018});
    sequence('stand-up',['crouch-a','stand','alarm'],{events:[{t:.8,event:'standing'}]});
    sequence('walk',['walk-a','walk-b','walk-a','walk-b','walk-a'],{loop:true,duration:.5,bounce:9,squash:.035});
    sequence('return',['crouch-a','stand','walk-a','walk-b','walk-a','idle-a'],{events:[{t:1,event:'return-arrived',attachment:'foot'}]});
    sequence('cheer',['cheer','cheer','cheer','cheer','cheer'],{loop:true,duration:1.7,squash:.02});
    sequence('hit',['alarm','alarm','alarm'],{squash:.05,rotation:6});
    o.clips.carry=structuredClone(o.clips.struggle);o.clips.stairs=structuredClone(o.clips.walk);
  } else {
    sequence('idle',['idle','idle','idle','idle','idle'],{loop:true,duration:2,squash:.012});
    sequence('walk',['walk-a','walk-b','walk-a','walk-b','walk-a'],{loop:true,duration:.6,bounce:6,squash:.02});
    sequence('attack',['idle','windup','windup','strike','strike','idle'],{duration:.65,events:[{t:.6,event:'impact',attachment:'weapon'}]});
    sequence('hit',['idle','hit','hit','idle'],{duration:.25,rotation:7});
    sequence('grab',['idle','grab','grab','carry-a'],{events:[{t:1,event:'capture-complete',attachment:'carry'}]});
    sequence('carry',['carry-a','carry-b','carry-a','carry-b','carry-a'],{loop:true,duration:.7,bounce:4});
    sequence('fall',['fall','fall','hit','idle'],{events:[{t:.7,event:'land',attachment:'foot'}]});
    sequence('dead',['hit','dead','dead'],{events:[{t:.2,event:'release-carried-target',attachment:'carry'}]});
    o.clips.stairs=structuredClone(o.clips.walk);o.clips['carry-stairs']=structuredClone(o.clips.carry);o.clips['carry-hit']=structuredClone(o.clips.carry);
    sequence('deploy',['idle','idle','idle'],{duration:.35,squash:.045});o.clips.withdraw=structuredClone(o.clips.deploy);
  }
  if(job.kind==='hero') {
    for(const action of ['grab','carry','carry-stairs','carry-hit'])delete o.clips[action];
    sequence('skill',['idle','skill-windup','skill-windup','skill','skill','proud'],{duration:1,events:[{t:.6,event:'skill-release',attachment:'weapon'}]});
    sequence('cheer',['proud','cheer','cheer','proud'],{loop:true,duration:2,squash:.015});
  }
  if(job.kind==='guard'||job.kind==='medic') {
    for(const action of ['grab','carry','carry-stairs','carry-hit'])delete o.clips[action];
    sequence('cheer',['idle','cheer','cheer','idle'],{loop:true,duration:2});
    if(job.kind==='guard')sequence('block',['idle','block','brace','idle']);
    else {
      sequence('heal',['idle','heal-windup','heal','heal','idle'],{events:[{t:.5,event:'heal-contact',attachment:'weapon'}]});
      sequence('repair',['idle','repair','repair','idle'],{events:[{t:.55,event:'repair-contact',attachment:'weapon'}]});
      sequence('self-heal',['idle','self-heal','self-heal','idle'],{events:[{t:.5,event:'heal-contact',attachment:'hit'}]});
    }
  }
  if(job.kind==='scout') {
    sequence('climb',['climb-a','climb-b','climb-a','climb-b','climb-a'],{loop:true,duration:.9,events:[{t:0,event:'beam-grip-left',attachment:'grip'},{t:.5,event:'beam-grip-right',attachment:'grip'}]});
    sequence('drop-from-beam',['drop','drop','land','idle'],{events:[{t:.7,event:'land',attachment:'foot'}]});
    o.clips.fall=structuredClone(o.clips['drop-from-beam']);o.clips['jump-stairs']=structuredClone(o.clips.fall);
  }
  if(job.kind==='archer') {
    o.clips.attack.events=[{t:.6,event:'release-projectile',attachment:'muzzle'}];
    sequence('draw-bow',['idle','windup','windup']);
    sequence('release-bow',['windup','strike','strike','idle'],{events:[{t:1/3,event:'release-projectile',attachment:'muzzle'}]});
  }
  if(job.kind==='shield') {
    sequence('block',['idle','block','block','idle']);
    sequence('shield-break',['block','hit','bare-idle','bare-idle','bare-idle'],{events:[{t:.5,event:'shield-detached'}]});
    o.clips['shield-stripped']=structuredClone(o.clips['shield-break']);
    o.variants={unshielded:Object.fromEntries(['idle','walk-a','walk-b','strike','carry-a','carry-b'].map(name=>[`${job.id}/${name}`,`${job.id}/bare-${name}`]))};
    o.variants.unshielded[`${job.id}/block`]=`${job.id}/bare-idle`;o.variants.unshielded[`${job.id}/hit`]=`${job.id}/bare-idle`;
  }
  return o;
}

export async function configureWholeCharacters(m,root) {
  let catalog;
  try {catalog=JSON.parse(await fs.readFile(path.join(root,'art/character-frames.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  m.actionLabels={...m.actionLabels,skill:'技能', 'draw-bow':'拉弓', 'release-bow':'放箭'};
  for(const job of catalog.jobs.filter(job=>job.status!=='rejected')) {
    const packed=await packCharacter(root,job);
    for(const id of Object.keys(m.sprites))if(id.startsWith(job.id+'/'))delete m.sprites[id];
    Object.assign(m.sprites,packed.sprites);m.files[job.id]={...packed.file,preload:!job.reserved};m.objects[job.id]=characterObject(job);
    m.bindings[job.id]={name:job.name,status:'whole-body-animation-ready',object:job.id,defaultAction:'idle',sprites:[`${job.id}/${job.cells[0]}`]};
  }
  m.statistics={...m.statistics,wholeBodyCharacters:catalog.jobs.filter(j=>j.status!=='rejected').length,generatedWebpBytes:Object.values(m.files).reduce((sum,f)=>sum+f.bytes,0)};
}
