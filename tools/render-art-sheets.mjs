import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {sampleArt} from '../art/runtime/art-player.js';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(import.meta.dirname,'..');
const m=JSON.parse(await fs.readFile(path.join(root,'assets/game/asset-manifest.json'),'utf8'));
const images={};for(const [id,file]of Object.entries(m.files))images[id]=await loadImage(path.join(root,file.path));
const out=path.join(root,'art/review');await fs.mkdir(out,{recursive:true});
function sprite(ctx,id,x,y,w,h,pivot=[.5,.5]){const s=m.sprites[id];if(!s)throw new Error('Missing '+id);ctx.drawImage(images[s.atlas],...s.rect,x-pivot[0]*w,y-pivot[1]*h,w,h);}
function draw(ctx,id,action,phase,x,y,scale=1,options={}){const p=sampleArt(m,id,action,phase,options);const anchor=options.anchorName?p.attachments[options.anchorName]:p.anchor;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.translate(-anchor[0],-anchor[1]);for(const n of p.layers){ctx.save();ctx.transform(...n.matrix);ctx.globalAlpha=n.alpha;sprite(ctx,n.sprite,0,0,n.width,n.height,n.pivot);ctx.restore();}ctx.restore();return p;}
function label(ctx,text,x,y){ctx.fillStyle='#e6d9b4';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.fillText(text,x,y);}
function sheet(name,entries,cols=3){const cw=370,ch=335,canvas=createCanvas(cw*cols,ch*Math.ceil(entries.length/cols));const ctx=canvas.getContext('2d');ctx.fillStyle='#2d3d34';ctx.fillRect(0,0,canvas.width,canvas.height);for(let i=0;i<entries.length;i++){const [id,action,p,options]=entries[i],x=(i%cols)*cw+cw/2,y=Math.floor(i/cols)*ch+ch-44;ctx.strokeStyle='#ffffff20';ctx.beginPath();ctx.moveTo(x-cw*.4,y);ctx.lineTo(x+cw*.4,y);ctx.stroke();draw(ctx,id,action,p,x,y,.56,options);label(ctx,id+' / '+action,x,y+29);}return fs.writeFile(path.join(out,name+'.png'),canvas.toBuffer('image/png'));}
await sheet('characters',Object.keys(m.objects).filter(k=>/^(E0|S0)/.test(k)).flatMap(id=>[[id,'idle',.2],[id,id==='S02'?'heal':'attack',.6],[id,id==='S02'?'self-heal':id==='S01'?'block':'carry',.35]]));
await sheet('mechanisms',Object.keys(m.objects).filter(k=>/^(G0|M0)/.test(k)).flatMap(id=>[[id,'idle',0],[id,'activate',.45],[id,'broken',1]]));
await sheet('liubei-and-capture',[['L01','idle',.3],['L01','grab',.75],['L01','struggle',.25],['L01','fall',.65],['L01','crouch',.3],['L01','stand-up',.7],['L01','return',.6],['L01','cheer',.3],['E04','climb',.25],['E02','shield-stripped',.75],['E01','dead',.7],['E06','dead',1]]);
const scene=createCanvas(...m.scene.canvas),ctx=scene.getContext('2d');sprite(ctx,m.scene.intro.background,0,0,scene.width,scene.height,[0,0]);const [x,y,scale]=m.scene.intro.chair;draw(ctx,'B05-chair','idle',0,x,y,scale);for(const [i,d]of m.scene.intro.dancers.entries())draw(ctx,'B05-dancer','dance',.15+i*.4,...d);draw(ctx,'L01','idle',.2,...m.scene.intro.lord);await fs.writeFile(path.join(out,'liubei-leisure.png'),scene.toBuffer('image/png'));
let samples=0;for(const [id,o]of Object.entries(m.objects))for(const action of Object.keys(o.clips))for(const p of [0,.2,.45,.7,1]){const pose=sampleArt(m,id,action,p);for(const n of pose.layers){if(!m.sprites[n.sprite])throw new Error(id+'/'+action+': missing sprite');if(!n.matrix.every(Number.isFinite)||!Number.isFinite(n.width)||!Number.isFinite(n.height))throw new Error(id+'/'+action+': invalid transform');}samples++;}
console.log(JSON.stringify({objects:Object.keys(m.objects).length,clips:Object.values(m.objects).reduce((n,o)=>n+Object.keys(o.clips).length,0),sampledPoses:samples,imagesBytes:Object.values(m.files).reduce((n,f)=>n+f.bytes,0),manifestBytes:(await fs.stat(path.join(root,'assets/game/asset-manifest.json'))).size}));
