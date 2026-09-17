import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {sampleArt} from '../art/runtime/art-player.js';

const root=path.resolve(import.meta.dirname,'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const catalog=await read('art/character-frames.json'),m=await read('assets/game/asset-manifest.json');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
let samples=0,sourceBytes=0,webpBytes=0,decodedBytes=0,initialBytes=0;
const images={};
for(const job of catalog.jobs){
  const object=m.objects[job.id],file=m.files[job.id];
  assert.equal(object.animation,'whole-body-key-poses',job.id);
  assert.equal(Object.keys(object.nodes).length,1,job.id+' must use one complete figure');
  assert.equal(file.path,`assets/game/characters/${job.id.toLowerCase()}.webp`);
  assert.equal(file.preload,!job.reserved,job.id+' initial loading');
  const bytes=await fs.readFile(path.join(root,file.path));
  assert.equal(digest(bytes),file.sha256);assert.equal(bytes.length,file.bytes);
  const meta=await sharp(bytes).metadata();assert(meta.hasAlpha);assert(meta.width<=1280&&meta.height<=1024);
  images[job.id]=await loadImage(bytes);
  sourceBytes+=(await fs.stat(path.join(root,job.source))).size;
  webpBytes+=bytes.length;decodedBytes+=meta.width*meta.height*4;
  if(file.preload!==false)initialBytes+=bytes.length;
  for(const name of job.cells){
    const sprite=m.sprites[`${job.id}/${name}`];assert(sprite,job.id+'/'+name);
    const [left,top,width,height]=sprite.rect;
    assert(left>=0&&top>=0&&left+width<=meta.width&&top+height<=meta.height);
    const {data}=await sharp(bytes).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let visible=0,transparent=0;
    for(let i=3;i<data.length;i+=4){if(data[i]>16)visible++;if(data[i]===0)transparent++;}
    assert(visible>width*height*.035&&transparent>width*height*.15,job.id+'/'+name+' empty or opaque');
  }
  for(const action of Object.keys(object.clips))for(const phase of [0,.2,.49,.5,.6,.75,1])for(const variant of job.kind==='shield'?[undefined,'unshielded']:[undefined]){
    const pose=sampleArt(m,job.id,action,phase,{variant});assert.equal(pose.layers.length,1);
    for(const layer of pose.layers){assert(m.sprites[layer.sprite]);assert(layer.matrix.every(Number.isFinite));}
    for(const point of Object.values(pose.attachments))assert(point.every(Number.isFinite));
    if(variant==='unshielded'&&['idle','walk','attack','carry'].includes(action))assert(pose.layers[0].sprite.includes('/bare-'),action);
    samples++;
  }
  if(/^E0/.test(job.id))for(const action of ['idle','walk','stairs','attack','grab','carry','carry-stairs','carry-hit','fall','dead'])assert(object.clips[action],job.id+'/'+action);
}
for(const action of ['climb','drop-from-beam','jump-stairs'])assert(m.objects.E04.clips[action]);
for(const action of ['heal','repair','self-heal'])assert(m.objects.S02.clips[action]);
assert.equal(sampleArt(m,'E02','shield-break',.5).layers[0].sprite,'E02/bare-idle');
assert.equal(sampleArt(m,'E05','attack',.6).layers[0].sprite,'E05/strike');
assert.equal(m.objects.E05.clips.attack.events[0].event,'release-projectile');
assert(!m.objects['B05-chair']&&!m.files['L01-LEGS']);
assert(!Object.keys(m.sprites).some(s=>/\/(arm|leg|torso|head)(?:-|$)/.test(s)));

// Render contacts with exactly the same parent transforms used by the game.
function draw(ctx,id,action,phase,x,y,scale,facing=1,anchorName,variant){
  const p=sampleArt(m,id,action,phase,{variant}),anchor=anchorName?p.attachments[anchorName]:p.anchor;
  ctx.save();ctx.translate(x,y);ctx.scale(scale*facing,scale);ctx.translate(-anchor[0],-anchor[1]);
  for(const n of p.layers){const s=m.sprites[n.sprite];ctx.save();ctx.transform(...n.matrix);ctx.drawImage(images[s.atlas],...s.rect,-n.width*n.pivot[0],-n.height*n.pivot[1],n.width,n.height);ctx.restore();}
  ctx.restore();return p;
}
const canvas=createCanvas(1200,1600),ctx=canvas.getContext('2d');ctx.fillStyle='#334139';ctx.fillRect(0,0,1200,1600);
for(let i=0;i<7;i++){
  const id=`E0${i+1}`,scale=.46,x=180+i%3*400,y=380+Math.floor(i/3)*395,phase=.25;
  ctx.strokeStyle='#c7be9b66';ctx.beginPath();ctx.moveTo(x-150,y);ctx.lineTo(x+150,y);ctx.stroke();
  const p=draw(ctx,id,'carry',phase,x,y,scale,1,undefined,id==='E02'?'unshielded':undefined);
  const contact=p.attachments.carry;
  draw(ctx,'L01','struggle',phase,x+(contact[0]-256)*scale,y+(contact[1]-486)*scale,.46,1,'carried');
  ctx.fillStyle='#f4e5b9';ctx.font='18px sans-serif';ctx.fillText(id+' / carry',x-60,y+30);
}
for(const [i,id] of ['H01','H02','H03'].entries()){
  draw(ctx,id,'skill',.65,200+i*400,1545,.55);
  ctx.fillStyle='#f4e5b9';ctx.font='18px sans-serif';ctx.fillText(id+' / skill',150+i*400,1580);
}
await fs.writeFile(path.join(root,'art/review/character-contacts.png'),canvas.toBuffer('image/png'));
const report={characters:catalog.jobs.length,poses:catalog.jobs.reduce((n,j)=>n+j.cells.length,0),sampledPoses:samples,sourceBytes,webpBytes,initialCharacterBytes:initialBytes,decodedBytes,sourceReductionPercent:+((1-webpBytes/sourceBytes)*100).toFixed(2),oldWholeAtlasBytes:3207732,atlasReductionPercent:+((1-webpBytes/3207732)*100).toFixed(2),oldDecodedBytes:54329344};
await fs.writeFile(path.join(root,'art/review/character-check.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report));
