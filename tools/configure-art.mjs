import {configureWholeCharacters} from './whole-character-art.mjs';
import {finalizeRuntimeArt} from './runtime-art.mjs';
import fs from 'node:fs/promises';
import {configureNoncharacterRedraw} from './noncharacter-redraw.mjs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const m=JSON.parse(await fs.readFile(path.join(root,'art/packed-assets.json'),'utf8'));
m.objects={};m.bindings={};
const clone=v=>structuredClone(v);
function node(sprite,x,y,width,height,z,pivot=[.5,.5],extra={}) {return {sprite,x,y,width,height,z,pivot,rotation:0,scaleX:1,scaleY:1,alpha:1,...extra};}
function clip(object,name,poses,events=[],loop=false) {
  poses=poses.map(([t,pose])=>[t,Object.fromEntries(Object.entries(pose).map(([slot,state])=>{
    if(!state.sprite||state.width!==undefined||state.height!==undefined)return [slot,state];
    const sprite=m.sprites[state.sprite],base=object.nodes[slot];
    const [w,h]=sprite.sourceSize??sprite.rect.slice(2);
    return [slot,{...state,width:base.height*w/h,height:base.height}];
  }))]);
  const tracks={};
  for(const slot of new Set(poses.flatMap(p=>Object.keys(p[1])))) {
    const keys=new Set(poses.flatMap(p=>Object.keys(p[1][slot]??{})));
    tracks[slot]=poses.map(([t,pose])=>{const value={t};for(const k of keys)value[k]=pose[slot]?.[k]??object.nodes[slot]?.[k]??({rotation:0,alpha:1,scaleX:1,scaleY:1}[k]);return value;});
  }
  object.clips[name]={loop,tracks,events};
}
const timed=(count,fn)=>Array.from({length:count},(_,i)=>[i/(count-1),fn(i/(count-1))]);
function register(o) {m.objects[o.id]=o;m.bindings[o.id]={name:o.name,status:'layered-animation-ready',object:o.id,defaultAction:'idle'};}

function mechanism(id,name,atlas,parts,anchor=[256,486]) {
  if(!m.files[atlas])return;
  const o={id,name,kind:'mechanism',canvas:[512,512],anchor,nodes:{},attachments:{foot:{x:256,y:486},mount:{x:256,y:50},muzzle:{x:256,y:290},impact:{x:256,y:478}},clips:{}};
  for(const [slot,suffix,x,y,w,h,z,pivot,extra] of parts)o.nodes[slot]=node(atlas+'/'+id+'-'+suffix,x,y,w,h,z,pivot,extra);
  clip(o,'idle',[[0,{}],[1,{}]],[],true);
  const main=Object.keys(o.nodes).filter(n=>n!=='broken');
  clip(o,'deploy',[[0,Object.fromEntries(main.map(n=>[n,{alpha:0,scaleY:.7}]))],[.65,{}],[1,{}]],[{t:1,event:'appearance-ready'}]);
  clip(o,'hit',[[0,{}],[.2,Object.fromEntries(main.map(n=>[n,{rotation:4}]))],[.55,Object.fromEntries(main.map(n=>[n,{rotation:-2}]))],[1,{}]]);
  clip(o,'destroy',[[0,{}],[.25,Object.fromEntries(main.map(n=>[n,{rotation:9}]))],[.7,{...Object.fromEntries(main.map(n=>[n,{alpha:0}])),broken:{alpha:1}}],[1,{...Object.fromEntries(main.map(n=>[n,{alpha:0}])),broken:{alpha:.4}}]],[{t:.25,event:'debris'}]);
  clip(o,'broken',[[0,{...Object.fromEntries(main.map(n=>[n,{alpha:0}])),broken:{alpha:1}}],[1,{...Object.fromEntries(main.map(n=>[n,{alpha:0}])),broken:{alpha:1}}]]);
  clip(o,'damaged',[[0,{broken:{alpha:.65}}],[1,{broken:{alpha:.65}}]]);
  clip(o,'remove',[[0,{}],[1,Object.fromEntries(main.map(n=>[n,{alpha:0}]))]]);
  register(o);return o;
}
const A='MX-A',B='MX-B';
const specs=[
['G01','地刺',A,[['spikes','spikes',256,456,300,250,0,[.5,1],{scaleY:.08}],['base','base',256,460,360,110,2],['broken','broken',256,460,360,110,9,undefined,{alpha:0}]]],
['G02','连弩车',A,[['base','base',240,370,320,225,0],['bow','bow',271,264,325,174,2],['bolt','bolt',285,262,280,45,3],['broken','broken',240,370,320,225,9,undefined,{alpha:0}]]],
['G03','悬毒壶',A,[['base','bracket',246,132,280,222,0],['pot','pot',256,293,185,229,1],['lid','lid',256,184,148,79,2],['broken','broken',256,386,250,167,9,undefined,{alpha:0}]]],
['G04','军需账房',A,[['base','base',256,371,327,230,1],['drawer','drawer',257,394,138,97,2],['bag','bag',274,286,110,128,3],['broken','broken',256,371,327,230,9,undefined,{alpha:0}]]],
['G05','寒风机关',A,[['base','base',248,328,294,312,0],['fan','fan',320,308,132,176,1],['vent','vent',320,308,150,210,2],['broken','broken',248,328,294,312,9,undefined,{alpha:0}]]],
['G06','拒马',B,[['base','base',256,350,360,270,1],['cracks','cracks',256,350,320,250,2,undefined,{alpha:0}],['broken','broken',256,436,360,96,9,undefined,{alpha:0}]]],
['G07','翻板',B,[['base','frame',256,445,374,119,0],['panel','panel',256,399,302,113,1,[.5,0]],['lip','lip',256,482,380,49,5],['broken','broken',256,445,374,119,9,undefined,{alpha:0}]]],
['G08','破甲钩爪',B,[['base','base',256,115,312,206,0],['jaw-left','claw-left',244,280,95,129,3,[.6,.06],{rotation:25}],['jaw-right','claw-right',266,280,95,129,3,[.4,.06],{rotation:-25}],['broken','broken',256,115,312,206,9,undefined,{alpha:0}]]],
['M01','悬锤',B,[['base','base',256,115,323,213,1],['chain','chain',256,207,29,172,0,[.5,0]],['hammer','hammer',256,352,226,231,2,[.5,.1]],['broken','broken',256,115,323,213,9,undefined,{alpha:0}]]],
['M02','滚木架',B,[['base','base',256,359,351,252,0],['log','log',248,281,289,224,1],['pin','pin',336,370,91,144,2],['broken','broken',256,437,353,98,9,undefined,{alpha:0}]]]
];
for(const args of specs){const o=mechanism(...args);if(!o)continue;
  const id=o.id;
  if(id==='G01')clip(o,'activate',[[0,{spikes:{scaleY:.08}}],[.2,{spikes:{scaleY:1}}],[.5,{spikes:{scaleY:1}}],[.8,{spikes:{scaleY:.08}}],[1,{spikes:{scaleY:.08}}]],[{t:.2,event:'impact'}]);
  if(id==='G02') {o.attachments.muzzle={x:427,y:262};clip(o,'activate',[[0,{}],[.25,{bow:{rotation:-8},bolt:{rotation:-8}}],[.42,{bow:{x:254},bolt:{alpha:0}}],[.6,{bow:{x:271},bolt:{alpha:0}}],[1,{}]],[{t:.42,event:'release-projectile',attachment:'muzzle'}]);clip(o,'aim',[[0,{bow:{rotation:-25},bolt:{rotation:-25}}],[1,{bow:{rotation:25},bolt:{rotation:25}}]]);}
  if(id==='G03'){o.attachments.muzzle={x:256,y:405};clip(o,'activate',timed(7,t=>({pot:{rotation:Math.sin(t*Math.PI*2)*5},lid:{rotation:Math.sin(t*Math.PI*2)*5,y:184-Math.sin(t*Math.PI)*3}})),[{t:.45,event:'release-projectile',attachment:'muzzle'}]);}
  if(id==='G04'){clip(o,'produce',[[0,{bag:{alpha:0,scaleX:.3,scaleY:.3}}],[.55,{bag:{alpha:1,scaleX:1.08,scaleY:1.08},drawer:{x:266}}],[1,{}]],[{t:.55,event:'bag-visible'}]);clip(o,'waiting',timed(7,t=>({bag:{y:286-Math.sin(t*Math.PI*2)*7}})),[],true);clip(o,'collect',[[0,{}],[1,{bag:{x:330,y:120,scaleX:.2,scaleY:.2,alpha:0}}]],[{t:.1,event:'collect-visual'}]);o.clips.activate=clone(o.clips.produce);}
  if(id==='G05'){clip(o,'activate',[[0,{fan:{rotation:0}}],[1,{fan:{rotation:360}}]],[{t:0,event:'wind-start'}],true);clip(o,'disabled',[[0,{fan:{rotation:0},vent:{alpha:.5}}],[1,{fan:{rotation:0},vent:{alpha:.5}}]]);}
  if(id==='G06'){clip(o,'damaged',[[0,{cracks:{alpha:1}}],[1,{cracks:{alpha:1}}]]);o.clips.activate=clone(o.clips.hit);}
  if(id==='G07'){o.occlusion={replaceFloor:true,openingRect:[69,396,374,86],frontSlot:'lip'};clip(o,'activate',[[0,{panel:{scaleY:1}}],[.18,{panel:{scaleY:.08,y:409}}],[.72,{panel:{scaleY:.08,y:409}}],[1,{panel:{scaleY:1}}]],[{t:.18,event:'floor-open'},{t:.28,event:'target-falls'},{t:1,event:'floor-close'}]);clip(o,'open',[[0,{panel:{scaleY:.08,y:409}}],[1,{panel:{scaleY:.08,y:409}}]]);}
  if(id==='G08'){o.nodes.chain=node('MX-B/M01-chain',256,190,24,120,1,[.5,0]);o.attachments.claw={parent:'jaw-left',x:12,y:110};clip(o,'activate',[[0,{}],[.35,{'jaw-left':{y:359,rotation:25},'jaw-right':{y:359,rotation:-25},chain:{height:203}}],[.48,{'jaw-left':{y:359,rotation:-8},'jaw-right':{y:359,rotation:8},chain:{height:203}}],[.82,{'jaw-left':{y:231,rotation:-8},'jaw-right':{y:231,rotation:8},chain:{height:75}}],[1,{}]],[{t:.48,event:'claw-close',attachment:'claw'},{t:.5,event:'shield-detach',attachment:'claw'}]);}
  if(id==='M01'){clip(o,'activate',[[0,{hammer:{y:272},chain:{height:85}}],[.25,{hammer:{y:244,rotation:-4},chain:{height:55}}],[.45,{hammer:{y:460},chain:{height:271}}],[.53,{hammer:{y:449},chain:{height:260}}],[1,{hammer:{y:272},chain:{height:85}}]],[{t:.25,event:'windup-end'},{t:.45,event:'impact',attachment:'impact'}]);clip(o,'load',[[0,{hammer:{y:460},chain:{height:271}}],[1,{hammer:{y:272},chain:{height:85}}]],[{t:1,event:'ready'}]);}
  if(id==='M02'){o.attachments.muzzle={x:407,y:368};clip(o,'activate',[[0,{}],[.2,{pin:{rotation:55},log:{x:285,y:300,rotation:25}}],[.45,{pin:{rotation:65},log:{x:418,y:365,rotation:85}}],[.46,{pin:{rotation:65},log:{alpha:0}}],[1,{pin:{rotation:65},log:{alpha:0}}]],[{t:.45,event:'release-projectile',attachment:'muzzle'}]);clip(o,'load',[[0,{log:{alpha:0,x:140,y:115},pin:{rotation:65}}],[.75,{}],[1,{}]],[{t:1,event:'ready'}]);clip(o,'empty',[[0,{log:{alpha:0},pin:{rotation:65}}],[1,{log:{alpha:0},pin:{rotation:65}}]]);}
  o.clips.cooldown=clone(o.clips.load??o.clips.idle);
  m.bindings[id].cardPose={action:id==='G01'?'activate':'idle',phase:id==='G01'?.3:0};
}

function single(id,name,sprite,width,height,kind='effect') {const o={id,name,kind,canvas:[512,512],anchor:[256,486],nodes:{image:node(sprite,256,486,width,height,0,[.5,1])},clips:{},attachments:{foot:{x:256,y:486}}};clip(o,'idle',[[0,{}],[1,{}]],[],true);register(o);return o;}
if(m.files.FX){for(const name of ['hit','block','dust','poison-drop','poison-splash','poison-status','wind','slow-ring','heal','repair','rescue','return-trail','shield','shield-break','wood','metal']){
 const o=single('FX-'+name,name,'FX/'+name,320,250);clip(o,'play',[[0,{image:{alpha:0,scaleX:.5,scaleY:.5}}],[.18,{image:{alpha:1,scaleX:1,scaleY:1}}],[.65,{image:{alpha:.85,scaleX:1.12,scaleY:1.12}}],[1,{image:{alpha:0,scaleX:1.3,scaleY:1.3}}]]);}
 const fire=single('FX-fire','火焰','FX/fire-0',180,270);fire.clips.idle={loop:true,tracks:{image:[0,1,2,0].map((n,i)=>({t:i/3,sprite:'FX/fire-'+n,hold:true}))},events:[]};
 const arrow=single('P-arrow','箭矢','FX/arrow',256,60,'projectile');clip(arrow,'fly',[[0,{}],[1,{}]],[],true);
 const log=single('P-log','滚木','MX-B/M02-log',260,200,'projectile');clip(log,'fly',[[0,{image:{rotation:0}}],[1,{image:{rotation:360}}]],[],true);
}
if(m.files['B-PARTS']){
 const gate={id:'B03-gate',name:'城门',kind:'scenery',canvas:[512,512],anchor:[256,486],nodes:{frame:node('B-PARTS/gate-frame',256,486,340,355,0,[.5,1]),left:node('B-PARTS/gate-left',134,484,123,265,1,[0,1]),right:node('B-PARTS/gate-right',378,484,123,265,1,[1,1])},attachments:{entry:{x:256,y:486}},clips:{}};
 clip(gate,'idle',[[0,{}],[1,{}]],[],true);clip(gate,'open',[[0,{}],[1,{left:{scaleX:.07},right:{scaleX:.07}}]],[{t:1,event:'entry-open'}]);register(gate);
 const bar=single('B03-barrier','外援挡栏','B-PARTS/barrier',350,95,'scenery');bar.nodes.image.pivot=[.06,.5];bar.nodes.image.x=120;bar.nodes.image.y=325;clip(bar,'open',[[0,{}],[1,{image:{rotation:-85}}]],[{t:1,event:'entry-open'}]);
 const curtain={id:'B05-curtain',name:'主帐门帘',kind:'scenery',anchor:[256,486],canvas:[512,512],nodes:{left:node('B-PARTS/curtain-left',110,180,155,285,0,[0,0]),right:node('B-PARTS/curtain-right',402,180,155,285,0,[1,0])},clips:{},attachments:{}};clip(curtain,'idle',timed(9,t=>({left:{scaleX:1+Math.sin(t*Math.PI*2)*.025},right:{scaleX:1-Math.sin(t*Math.PI*2)*.025}})),[],true);register(curtain);
 for(const color of ['green','red','blue']){const flag=single('B-flag-'+color,'军旗','B-PARTS/flag-'+color,175,230,'scenery');clip(flag,'idle',timed(9,t=>({image:{scaleX:1+Math.sin(t*Math.PI*2)*.03,rotation:Math.sin(t*Math.PI*2)}})),[],true);}
}

m.actionAliases={enemy:{carryStairs:'carry-stairs',carryHit:'carry-hit',death:'dead',stairUp:'stairs',stairDown:'stairs'},lord:{idle:'idle',grabbing:'grab',carried:'struggle',dropped:'crouch',returning:'return',victory:'cheer'},mechanism:{attack:'activate',ready:'idle',death:'destroy'}};
m.scene={canvas:[1672,941],background:'B01',laneBaselines:[819,556,292],columnCenters:{start:140,end:1532,count:10},layers:{background:0,rearSupports:10,devices:20,characters:30,frontLip:40,effects:50,ui:60},intro:{background:'B05-BACKDROP',lord:[1250,785,.9],chair:[1250,785,.9],dancers:[[510,800,.84],[815,763,.72]]},floorModule:'B-PARTS/platform',floorFront:'B-PARTS/front-lip',beam:'B-PARTS/beam',post:'B-PARTS/post',stairs:{bottomToMiddle:{sprite:'B-PARTS/stairs-left',rect:[1470,540,202,296]},middleToTop:{sprite:'B-PARTS/stairs-right',rect:[0,281,202,291]}}};
m.loadingGroups={intro:['L01','B05-dancer','B05-BACKDROP','UI-PANELS','UI-ICONS'],battle:['B01','B-PARTS','MX-A','MX-B','FX','L01','UI-PANELS','UI-ICONS'],enemies:['E01','E02','E03','E04','E05','E06','E07'],defenders:['S01','S02']};
m.actionLabels={idle:'待机',walk:'行走',stairs:'上下楼梯',carry:'携带行走','carry-stairs':'携带过楼梯',attack:'攻击',grab:'抓取',hit:'受击','carry-hit':'携带受击',fall:'落地',dead:'倒地',deploy:'部署',withdraw:'撤回',block:'举盾格挡','shield-break':'盾牌破碎','shield-stripped':'被钩走盾',climb:'攀顶','drop-from-beam':'松手下落','jump-stairs':'跳梯',heal:'治疗',repair:'维修','self-heal':'给自己治疗',struggle:'被扛挣扎',crouch:'蹲伏呼救','stand-up':'起身',return:'回营',cheer:'胜利松气',activate:'发动',broken:'损坏残件',destroy:'摧毁',damaged:'受损',remove:'拆除',aim:'瞄准',produce:'产出钱袋',waiting:'待收',collect:'收取',disabled:'停用',open:'开启',load:'装填',empty:'空架',cooldown:'冷却复位',dance:'舞蹈',play:'播放',fly:'飞行'};
m.scene.showcase=[{id:'G04',floor:2,column:2,action:'produce'},{id:'G05',floor:2,column:4,action:'activate'},{id:'S02',floor:2,column:5.1,action:'heal'},{id:'E04',floor:2,column:6.4,action:'climb',elevated:true},{id:'G08',floor:2,column:7.5,action:'activate',elevated:true},{id:'G03',floor:1,column:2,action:'activate',elevated:true},{id:'G06',floor:1,column:4,action:'hit'},{id:'E02',floor:1,column:5.2,action:'block',facing:-1},{id:'S01',floor:1,column:6.2,action:'attack'},{id:'G07',floor:1,column:7.6,action:'activate'},{id:'G01',floor:0,column:2,action:'activate'},{id:'G02',floor:0,column:3.5,action:'activate'},{id:'E01',floor:0,column:4.8,action:'walk'},{id:'E03',floor:0,column:6,action:'attack'},{id:'M01',floor:0,column:7.2,action:'activate',elevated:true},{id:'M02',floor:0,column:8.4,action:'activate'}];

await configureNoncharacterRedraw(m,root,{node,clip,register,clone});
await configureWholeCharacters(m,root);
await finalizeRuntimeArt(m,root);
await fs.writeFile(path.join(root,'assets/game/asset-manifest.json'),JSON.stringify(m)+'\n','utf8');
console.log('角色动作:',Object.keys(m.objects).length,Object.values(m.objects).reduce((n,o)=>n+Object.keys(o.clips).length,0));
