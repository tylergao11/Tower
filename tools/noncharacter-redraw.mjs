import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/** The replacement owns only mechanisms and effects; character ownership stays separate. */
export async function configureNoncharacterRedraw(m,root,{node,clip,register,clone}){
  let packed;
  try{
    packed=JSON.parse(await fs.readFile(path.join(root,'art/noncharacter-redraw-assets.json'),'utf8'));
    await Promise.all(Object.values(packed.groups).flatMap(group=>Object.values(group.entries).map(entry=>fs.access(path.join(root,entry.path)))));
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    await import('./pack-noncharacter-redraw.mjs');
    packed=JSON.parse(await fs.readFile(path.join(root,'art/noncharacter-redraw-assets.json'),'utf8'));
  }
  for(const [group,data] of Object.entries(packed.groups))for(const [name,entry] of Object.entries(data.entries)){
    if(group==='ui')continue;
    const id=`REDRAW-${group}-${name}`,bytes=await fs.readFile(path.join(root,entry.path));
    m.files[id]={path:entry.path,width:entry.width,height:entry.height,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),hasAlpha:true,source:data.source};
    m.sprites[id]={atlas:id,rect:[0,0,entry.width,entry.height],sourceSize:[entry.width,entry.height]};
  }
  const piece=(group,name,x,y,w,z=0,pivot=[.5,1])=>{
    const sprite=`REDRAW-${group}-${name}`,s=m.sprites[sprite];
    return node(sprite,x,y,w,w*s.rect[3]/s.rect[2],z,pivot);
  };
  const part=(...args)=>piece('parts',...args),whole=(...args)=>piece('mechanisms',...args);
  const chain=(y,h)=>node('MX-B/M01-chain',256,y,24,h,1,[.5,0]);
  const names={G01:'地刺',G02:'连弩车',G03:'悬毒壶',G04:'军需账房',G05:'寒风机关',G06:'拒马',G07:'翻板',G08:'破甲钩爪',M01:'悬锤',M02:'滚木架'};
  const definitions={
    G01:{base:part('G01-base',256,486,430,2),spikes:part('G01-spikes',256,450,354,1)},
    G02:{base:part('G02-chassis',278,486,354,1),bow:part('G02-bow',240,294,430,2)},
    G03:{mount:part('G03-mount',256,32,335,0,[.5,0]),jar:part('G03-jar',256,483,233,2)},
    G04:{base:whole('G04',256,486,440)},
    G05:{base:part('G05-housing',288,480,320),fan:part('G05-fan',227,268,158,2,[.5,.5])},
    G06:{base:whole('G06',256,486,430)},
    G07:{base:part('G07-frame',256,486,440,0),panel:part('G07-panel',256,476,397,2,[.5,1])},
    G08:{mount:part('G08-mount',256,30,320,0,[.5,0]),chain:chain(130,170),claw:part('G08-claw',256,472,265,2)},
    M01:{mount:part('M01-mount',256,30,330,0,[.5,0]),chain:chain(135,128),hammer:part('M01-hammer',256,400,300,2)},
    M02:{base:part('M02-cradle',256,486,440,1),log:part('M02-log',246,385,346,2)},
  };
  for(const [id,nodes] of Object.entries(definitions)){
    const o={id,name:names[id],kind:'mechanism',naturalFacing:['G02','M02'].includes(id)?-1:1,canvas:[512,512],anchor:[256,486],nodes,attachments:{foot:{x:256,y:486},mount:{x:256,y:32},muzzle:{x:66,y:260},impact:{x:256,y:478}},clips:{}};
    const slots=Object.keys(nodes),all=state=>Object.fromEntries(slots.map(slot=>[slot,state]));
    clip(o,'idle',[[0,{}],[1,{}]],[],true);
    clip(o,'deploy',[[0,all({alpha:0,scaleY:.85})],[.7,{}],[1,{}]],[{t:1,event:'appearance-ready'}]);
    clip(o,'hit',[[0,{}],[.25,all({rotation:3})],[.55,all({rotation:-2})],[1,{}]]);
    clip(o,'destroy',[[0,{}],[.3,all({rotation:7})],[1,all({alpha:0,scaleY:.7})]],[{t:.3,event:'debris'}]);
    clip(o,'broken',[[0,all({alpha:0})],[1,all({alpha:0})]]);
    clip(o,'damaged',[[0,all({alpha:.75})],[1,all({alpha:.75})]],[],true);
    clip(o,'disabled',[[0,all({alpha:.45})],[1,all({alpha:.45})]],[],true);
    if(id==='G01'){
      clip(o,'idle',[[0,{spikes:{scaleY:.1,y:473}}],[1,{spikes:{scaleY:.1,y:473}}]],[],true);
      clip(o,'activate',[[0,{spikes:{scaleY:.1,y:473}}],[.2,{}],[.6,{}],[1,{spikes:{scaleY:.1,y:473}}]],[{t:.2,event:'impact'}]);
    }
    if(id==='G02'){
      clip(o,'activate',[[0,{}],[.16,{bow:{x:252}}],[.35,{bow:{x:234}}],[1,{}]],[{t:.16,event:'release-projectile',attachment:'muzzle'}]);
      o.clips.aim=clone(o.clips.idle);
    }
    if(id==='G03')clip(o,'activate',[[0,{}],[.35,{jar:{rotation:3}}],[.7,{jar:{rotation:-2}}],[1,{}]],[{t:.35,event:'release-projectile'}]);
    if(id==='G04'){
      clip(o,'produce',[[0,{}],[.5,{base:{scaleY:1.018}}],[1,{}]],[],true);
      o.clips.waiting=clone(o.clips.idle);o.clips.collect=clone(o.clips.hit);
    }
    if(id==='G05')clip(o,'activate',[[0,{fan:{rotation:0}}],[1,{fan:{rotation:360}}]],[],true);
    if(id==='G07'){
      o.occlusion={replaceFloor:true,openingRect:[66,380,380,106]};
      clip(o,'activate',[[0,{}],[.2,{panel:{scaleY:.08,y:397}}],[.8,{panel:{scaleY:.08,y:397}}],[1,{}]],[{t:.2,event:'floor-open'},{t:.3,event:'target-falls'},{t:1,event:'floor-close'}]);
      clip(o,'open',[[0,{panel:{scaleY:.08,y:397}}],[1,{panel:{scaleY:.08,y:397}}]]);
    }
    if(id==='G08'){
      o.attachments.claw={parent:'claw',x:0,y:-70};
      clip(o,'activate',[[0,{}],[.4,{claw:{y:506,scaleX:1.07},chain:{height:204}}],[.5,{claw:{y:506,scaleX:.78},chain:{height:204}}],[.8,{claw:{y:442,scaleX:.78},chain:{height:140}}],[1,{}]],[{t:.5,event:'claw-close',attachment:'claw'},{t:.5,event:'shield-detach',attachment:'claw'}]);
    }
    if(id==='M01'){
      clip(o,'activate',[[0,{}],[.25,{hammer:{y:364},chain:{height:92}}],[.45,{hammer:{y:680},chain:{height:408}}],[.55,{hammer:{y:669},chain:{height:397}}],[1,{}]],[{t:.25,event:'windup-end'},{t:.45,event:'impact',attachment:'impact'}]);
      clip(o,'load',[[0,{hammer:{y:680},chain:{height:408}}],[1,{}]],[{t:1,event:'ready'}]);
    }
    if(id==='M02'){
      o.attachments.muzzle={x:72,y:395};
      clip(o,'activate',[[0,{}],[.3,{log:{x:142,y:407,rotation:-50}}],[.45,{log:{x:54,y:451,rotation:-100}}],[.46,{log:{alpha:0}}],[1,{log:{alpha:0}}]],[{t:.45,event:'release-projectile',attachment:'muzzle'}]);
      clip(o,'load',[[0,{log:{alpha:0,y:245}}],[.75,{}],[1,{}]],[{t:1,event:'ready'}]);
      clip(o,'empty',[[0,{log:{alpha:0}}],[1,{log:{alpha:0}}]]);
    }
    o.clips.activate ||= clone(o.clips.hit);o.clips.load ||= clone(o.clips.idle);o.clips.cooldown=clone(o.clips.load);
    register(o);m.bindings[id].cardPose={action:id==='G01'?'activate':'idle',phase:id==='G01'?.3:0};
  }
  const effects=packed.groups.effects.entries;
  for(const name of Object.keys(effects)){
    const sprite=`REDRAW-effects-${name}`;
    m.sprites['FX/'+name]=m.sprites[sprite];
    const o=m.objects['FX-'+name];
    if(o){const s=m.sprites[sprite],n=o.nodes.image;n.sprite=sprite;n.width=320;n.height=320*s.rect[3]/s.rect[2];}
  }
  m.sprites['MX-A/G04-bag']=m.sprites['REDRAW-effects-bag'];
  m.sprites['MX-B/M02-log']=m.sprites['REDRAW-parts-M02-log'];
  const arrow=m.objects['P-arrow'];if(arrow)arrow.nodes.image.sprite='REDRAW-effects-arrow';
  const log=m.objects['P-log'];if(log)log.nodes.image.sprite='REDRAW-parts-M02-log';
}
