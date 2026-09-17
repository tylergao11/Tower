// Character rig authoring. Geometry lives here; both players consume the built manifest.
export function configureCharacters(m, {node, clip, timed, register, clone}) {
  const size=(sprite,value,axis='height')=>{
    const source=m.sprites[sprite];
    if(!source)throw new Error('Missing character part: '+sprite);
    const [w,h]=source.sourceSize??source.rect.slice(2);
    return axis==='height'?{width:value*w/h,height:value}:{width:value,height:value*h/w};
  };
  const part=(sprite,x,y,value,z,pivot,parent,axis='height',extra={})=>({...node(sprite,x,y,0,0,z,m.sprites[sprite].joints?.mount??pivot,{parent,...extra}),...size(sprite,value,axis)});
  const joint=(x,y,parent)=>({x,y,parent,rotation:0,scaleX:1,scaleY:1,alpha:1});
  const variant=(sprite,value,pivot,extra={})=>({sprite,...size(sprite,value),pivot:m.sprites[sprite].joints?.mount??pivot,...extra});
  const socket=(n,u,v)=>({x:(u-n.pivot[0])*n.width,y:(v-n.pivot[1])*n.height});
  const grip=n=>socket(n,...m.sprites[n.sprite].joints.grip);
  const followSocket=(o,slot,parent,name)=>{
    Object.assign(o.nodes[slot],{parent,socket:name,x:0,y:0});
    for(const c of Object.values(o.clips))for(const key of c.tracks[slot]??[]){key.x=0;key.y=0;}
  };
  // Locations are art-space joints, not gameplay coordinates. Heights preserve source aspect.
  const profiles=[
    {id:'E01',name:'曹军步卒',kind:'sword',torso:204,head:200,arm:127,back:123,weapon:205},
    {id:'E02',name:'盾兵',kind:'shield',torso:204,head:200,arm:126,back:123,weapon:195},
    {id:'E03',name:'破械工兵',kind:'heavy',torso:204,head:200,arm:124,back:108,weapon:260,weaponAngle:20},
    {id:'E04',name:'飞檐斥候',kind:'scout',torso:194,head:194,arm:119,back:112,weapon:185},
    {id:'E05',name:'敌军弓手',kind:'bow',torso:204,head:200,arm:92,back:97,weapon:245},
    {id:'E06',name:'重甲虎卫',kind:'heavy',torso:204,head:198,arm:125,back:120,weapon:263,weaponAngle:45},
    {id:'E07',name:'曹洪',kind:'sword',torso:204,head:202,arm:123,back:120,weapon:210},
    {id:'S01',name:'刀盾亲卫',kind:'shield',torso:204,head:190,arm:122,back:123,weapon:190},
    {id:'S02',name:'军医匠',kind:'medic',torso:204,head:190,arm:112,back:120,weapon:62}
  ];
  for(const p of profiles){
    const {id,name,kind}=p,s=n=>id+'/'+n;
    const o={id,name,kind:'character',canvas:[512,512],anchor:[256,486],nodes:{
      body:joint(256,360),
      'leg-back':part(s('leg-back'),-32,0,128,1,[.5,.02],'body'),
      'leg-front':part(s('leg-front'),35,0,128,2,[.5,.02],'body'),
      torso:part(s('torso'),0,-50,p.torso,4,[.5,.5],'body'),
      'arm-back':part(s('arm-back'),58,-64,p.back,3,undefined,'torso'),
      head:part(s('head'),24,-68,p.head,5,[.59,.93],'torso'),
      'arm-front':part(s('arm-front'),-51,-61,p.arm,6,[.24,.2],'torso')
    },attachments:{foot:{x:256,y:486},hit:{parent:'torso',x:0,y:0}},clips:{}};
    const n=o.nodes;
    n['arm-front'].x=-n.torso.width*.35;
    o.hands={right:'arm-front',left:'arm-back'};
    n.weapon=part(s('weapon'),0,0,p.weapon,5.5,m.sprites[s('weapon')].joints.grip,'arm-front','width',{socket:'grip'});
    o.attachments.weapon={parent:'arm-front',socket:'grip'};
    o.attachments.carry={parent:'torso',x:15,y:-147};
    if(kind==='shield'){
      n.equipment=part(s('equipment'),0,0,168,7,m.sprites[s('equipment')].joints.grip,'arm-back','height',{socket:'grip'});o.shieldSlots=['equipment'];
    }
    if(kind==='heavy'){
      n.weapon.rotation=p.weaponAngle;
      n['arm-back'].z=5.75;
      o.constraints=[{node:'arm-back',socket:'grip',target:'weapon',targetSocket:'support',visibleWith:'weapon'}];
    }
    if(kind==='medic')Object.assign(n.weapon,size(s('weapon'),62));
    if(kind==='bow'){
      // Left arm extends with the bow; the right arm bends to pull the string.
      n.weapon.parent='arm-back';Object.assign(n.weapon,size(s('weapon'),245));
      const leftGrip=grip(n['arm-back']),rightGrip=grip(n['arm-front']);
      const restX=n['arm-front'].x+rightGrip.x-n['arm-back'].x-leftGrip.x;
      const restY=n['arm-front'].y+rightGrip.y-n['arm-back'].y-leftGrip.y;
      const top=socket(n.weapon,...m.sprites[s('weapon')].joints.top),bottom=socket(n.weapon,...m.sprites[s('weapon')].joints.bottom);
      n.nock=joint(restX,restY,'weapon');
      n['string-top']=node('FX/cord',top.x,top.y,1,1.6,5.4,[0,.5],{parent:'weapon'});
      n['string-bottom']=node('FX/cord',restX,restY,1,1.6,5.4,[0,.5],{parent:'weapon'});
      n.equipment=part(s('equipment'),0,0,197,5.6,[0,.5],'nock','width');
      o.constraints=[{node:'arm-front',socket:'grip',target:'nock',visibleWith:'equipment'}];
      o.attachments.muzzle={parent:'equipment',...socket(n.equipment,1,.5)};o.attachments.weapon={...o.attachments.muzzle};
      const stringPose=(offset=0,alpha=1)=>{const pull=restX+offset;return {
        nock:{x:pull},
        'string-top':{width:Math.hypot(pull-top.x,restY-top.y),rotation:Math.atan2(restY-top.y,pull-top.x)*180/Math.PI},
        'string-bottom':{x:pull,y:restY,width:Math.hypot(bottom.x-pull,bottom.y-restY),rotation:Math.atan2(bottom.y-restY,bottom.x-pull)*180/Math.PI},
        equipment:{alpha}
      };};
      for(const [slot,state]of Object.entries(stringPose()))Object.assign(n[slot],state);
      o.bowPose=stringPose;
      o.bowRecoil=top.x-restX;
    }
    const resting=t=>{const wave=Math.sin(t*Math.PI*2);return {torso:{y:-50+wave*1.5},head:{rotation:wave*.7},...(o.bowPose?o.bowPose():{'arm-front':{rotation:wave*1.2}})};};
    clip(o,'idle',timed(9,resting),[],true);o.clips.idle.duration=2.4;
    const raised=(slot,rotation)=>variant(s(kind==='medic'?'arm-grab':'arm-carry'),125,undefined,{rotation,scaleX:slot==='arm-back'?-1:1,...(slot==='arm-back'?{z:5.75}:{} )});
    const carryArms={'arm-front':{...raised('arm-front',-20),x:n['arm-front'].x,y:n['arm-front'].y},'arm-back':{...raised('arm-back',-24),x:n['arm-back'].x,y:n['arm-back'].y},weapon:{alpha:0},...(n.equipment?{equipment:{alpha:0}}:{})};
    const palms=['arm-front','arm-back'].map(slot=>{const arm=carryArms[slot],tip=grip(arm),angle=arm.rotation*Math.PI/180;tip.x*=arm.scaleX;return {x:arm.x+tip.x*Math.cos(angle)-tip.y*Math.sin(angle),y:arm.y+tip.x*Math.sin(angle)+tip.y*Math.cos(angle)};});
    o.attachments.carry={parent:'torso',x:(palms[0].x+palms[1].x)/2,y:(palms[0].y+palms[1].y)/2};
    const gait=(t,carrying=false,stairs=false)=>{const wave=Math.sin(t*Math.PI*2);return {
      body:{y:360-Math.abs(wave)*(stairs?5:2)},
      'leg-front':{rotation:wave*(stairs?24:16),y:-Math.max(0,wave)*(stairs?8:3)},
      'leg-back':{rotation:-wave*(stairs?24:16),y:-Math.max(0,-wave)*(stairs?8:3)},
      head:{rotation:-wave*.8},...(carrying?carryArms:o.bowPose?o.bowPose():{'arm-front':{rotation:-wave*8},'arm-back':{rotation:wave*8}})
    };};
    const steps=[{t:0,event:'foot-left'},{t:.5,event:'foot-right'}];
    for(const [action,carrying,stairs] of [['walk',false,false],['stairs',false,true],['carry',true,false],['carry-stairs',true,true]]){
      clip(o,action,timed(9,t=>gait(t,carrying,stairs)),steps,true);o.clips[action].duration=stairs?.85:.7;
    }
    const angles=kind==='heavy'?[0,-22,-40,10,5,0]:[0,-28,-52,38,14,0];
    const swing=angles.map((r,i)=>[i/5,{torso:{rotation:r*.07},'arm-front':{rotation:r},head:{rotation:-r*.025}}]);
    clip(o,kind==='medic'?'repair':'attack',swing,[{t:.6,event:'impact',attachment:'weapon'}]);
    if(o.bowPose){
      const pose=o.bowPose;
      clip(o,'attack',[[0,pose()],[.25,pose(-6)],[.5,pose(-12)],[.6,pose(-12,0)],[.66,pose(o.bowRecoil,0)],[.8,pose(0,0)],[1,pose()]],[{t:.6,event:'release-projectile',attachment:'muzzle'}]);
      clip(o,'draw-bow',[[0,pose()],[1,pose(-12)]]);
      clip(o,'release-bow',[[0,pose(-12)],[.2,pose(-12,0)],[.3,pose(o.bowRecoil,0)],[1,pose(0,0)]],[{t:.2,event:'release-projectile',attachment:'muzzle'}]);
      for(const action of ['carry','carry-stairs'])for(const slot of ['string-top','string-bottom'])o.clips[action].tracks[slot]=[{t:0,alpha:0},{t:1,alpha:0}];
      delete o.bowPose;
      delete o.bowRecoil;
    }
    const reach={'arm-front':variant(s('arm-grab'),104,[.2,.58],{rotation:-20}),weapon:{alpha:0},...(n.equipment?{equipment:{alpha:0}}:{})};
    clip(o,'grab',[[0,{}],[.18,reach],[.55,{...reach,torso:{rotation:6}}],[1,carryArms]],[{t:1,event:'capture-complete',attachment:'carry'}]);
    const hit={body:{rotation:-5},head:{sprite:s('head-hit'),rotation:-5},'arm-front':{rotation:12}};
    clip(o,'hit',[[0,{}],[.18,hit],[.5,hit],[1,{}]]);
    clip(o,'carry-hit',[[0,carryArms],[.2,{...carryArms,body:{rotation:-5},head:{sprite:s('head-hit')}}],[1,carryArms]]);
    const airborne={body:{rotation:8},head:{sprite:s('head-hit')},'arm-front':{rotation:-48},'arm-back':{rotation:20},'leg-front':{rotation:30},'leg-back':{rotation:-25}};
    clip(o,'fall',[[0,airborne],[.6,airborne],[.8,{body:{y:370,scaleY:.94},head:{sprite:s('head-hit')}}],[1,{}]],[{t:.8,event:'land',attachment:'foot'}]);
    // Rotate a connected body around the hips; do not scatter independently translated limbs.
    clip(o,'dead',[[0,{}],[.2,hit],[.68,{body:{y:379,rotation:-75},head:{sprite:s('head-hit')},'leg-front':{rotation:12},'leg-back':{rotation:-12},'arm-front':{rotation:25}}],[1,{body:{y:386,rotation:-88},head:{sprite:s('head-hit')},'leg-front':{rotation:6},'leg-back':{rotation:-6},'arm-front':{rotation:18}}]],[{t:.2,event:'release-carried-target',attachment:'carry'},{t:.68,event:'body-ground-contact'}]);
    clip(o,'deploy',[[0,{body:{alpha:0,y:380,scaleX:.9,scaleY:.9}}],[.7,{body:{alpha:1,y:358}}],[1,{}]],[{t:1,event:'appearance-ready'}]);
    clip(o,'withdraw',[[0,{}],[1,{body:{alpha:0,y:345}}]]);
    if(kind==='shield'){
      clip(o,'block',[[0,{}],[.2,{'arm-back':{rotation:-18}}],[.7,{'arm-back':{rotation:-18}}],[1,{}]],[{t:.2,event:'shield-contact'}]);
      clip(o,'shield-break',[[0,{}],[.2,{equipment:{rotation:20}}],[.7,{equipment:{y:130,rotation:95,alpha:.5}}],[1,{equipment:{alpha:0}}]],[{t:.2,event:'shield-detached'}]);
      clip(o,'shield-stripped',[[0,{}],[.25,{equipment:{y:-20,rotation:15}}],[.75,{equipment:{y:-200,rotation:55,alpha:.8}}],[1,{equipment:{alpha:0}}]],[{t:.25,event:'shield-detached'}]);
    }
    if(kind==='scout'){
      const climb=t=>{const a=Math.sin(t*Math.PI*2);return {
        torso:{sprite:s('torso-climb'),...size(s('torso-climb'),178)},head:{y:-72,rotation:a*2},
        'arm-back':variant(s('arm-climb-back'),185,[.5,.89],{x:47,y:-63,rotation:a*9}),
        'arm-front':variant(s('arm-climb-front'),185,[.5,.89],{x:-42,y:-63,rotation:-a*9}),
        'leg-front':variant(s('legs-tucked'),139,[.5,.02],{x:0,y:7,rotation:a*3}),
        'leg-back':{alpha:0},weapon:{alpha:0}
      };};
      o.attachments.grip={parent:'torso',x:0,y:-225};
      clip(o,'climb',timed(9,climb),[{t:0,event:'beam-grip-left',attachment:'grip'},{t:.5,event:'beam-grip-right',attachment:'grip'}],true);o.clips.climb.duration=.9;
      o.clips['drop-from-beam']=clone(o.clips.fall);o.clips['jump-stairs']=clone(o.clips.fall);
    }
    if(kind==='medic'){
      clip(o,'heal',timed(7,t=>({'arm-front':{rotation:-16*Math.sin(t*Math.PI)},head:{rotation:Math.sin(t*Math.PI)*3}})),[{t:.55,event:'heal-contact',attachment:'weapon'}]);
      const self={'arm-front':variant(s('arm-carry'),110,[.28,.3],{rotation:-10}),weapon:{alpha:0}};
      clip(o,'self-heal',[[0,{}],[.3,self],[.75,self],[1,{}]],[{t:.55,event:'heal-contact',attachment:'hit'}]);
      // The equipment illustration is a complete tool pouch, not a hand-held hammer.
      const repair={'arm-front':variant(s('arm-grab'),100,[.2,.5],{rotation:8}),weapon:{alpha:0}};
      clip(o,'repair',[[0,{}],[.25,repair],[.55,{...repair,'arm-front':{...repair['arm-front'],rotation:0}}],[.8,repair],[1,{}]],[{t:.55,event:'repair-contact',attachment:'weapon'}]);
    }
    register(o);m.bindings[id].sprites=[s('reference')];
  }

  const o={id:'L01',name:'刘备',kind:'character',canvas:[512,512],anchor:[256,486],nodes:{
    body:joint(275,312),
    torso:part('L01/recline-torso',0,0,225,3,[.5,.5],'body'),
    'leg-back':part('L01-LEGS/seated-back',-18,30,130,1,[.78,.15],'body'),
    'leg-front':part('L01-LEGS/seated-front',-80,49,144,2,[.78,.15],'body'),
    'arm-back':part('L01/arm-back',73,-46,110,1,[.86,.18],'body'),
    head:part('L01/head-relaxed',78,-81,194,5,[.58,.94],'body'),
    'arm-front':part('L01/arm-front',57,-28,126,6,undefined,'body')
  },attachments:{foot:{x:256,y:486},carried:{parent:'body',x:0,y:30},head:{parent:'head',x:0,y:-80},rescue:{x:256,y:480}},clips:{}};
  const idle=t=>{const wave=Math.sin(t*Math.PI*2);return {head:{rotation:wave*1.2},'arm-front':{rotation:wave*4},'leg-front':{rotation:wave*1.5}};};
  clip(o,'idle',timed(9,idle),[],true);o.clips.idle.duration=3;
  const stand={body:{x:256,y:325},torso:variant('L01/torso',235,[.5,.5]),head:variant('L01/head-alarm',180,[.58,.94],{x:19,y:-90,rotation:0}),
    'arm-front':variant('L01/arm-brace',120,[.78,.8],{x:52,y:-50,rotation:0}),
    'arm-back':variant('L01/arm-reach',110,[.85,.5],{x:-59,y:-48,rotation:12}),
    'leg-front':variant('L01-LEGS/standing-front',127,[.5,.02],{x:30,y:36,rotation:0}),
    'leg-back':variant('L01-LEGS/standing-back',127,[.5,.02],{x:-32,y:36,rotation:0})};
  clip(o,'grab',[[0,{}],[.25,{head:{sprite:'L01/head-alarm',rotation:-6},'arm-front':{rotation:-12}}],[.7,stand],[1,stand]],[{t:1,event:'lift-ready',attachment:'carried'}]);
  const captive=t=>{const a=Math.sin(t*Math.PI*2);return {body:{x:270,y:322,rotation:a*2},torso:variant('L01/torso-carried',160,[.5,.5]),
    head:variant('L01/head-alarm',172,[.58,.94],{x:104,y:-26,rotation:12+a*4}),
    'arm-front':variant('L01/arm-reach',105,[.86,.55],{x:77,y:10,rotation:a*15}),
    'arm-back':variant('L01/arm-brace',100,[.8,.8],{x:56,y:-20,rotation:-a*12}),
    'leg-front':variant('L01-LEGS/seated-front',121,[.78,.15],{x:-95,y:7,rotation:-16+a*12}),
    'leg-back':variant('L01-LEGS/seated-back',112,[.78,.15],{x:-79,y:0,rotation:10-a*12})};};
  clip(o,'struggle',timed(9,captive),[],true);o.clips.struggle.duration=1.2;o.clips.carry=clone(o.clips.struggle);
  const crouch={...stand,body:{x:256,y:399},torso:variant('L01/torso-crouch',174,[.5,.5]),head:variant('L01/head-alarm',171,[.58,.94],{x:23,y:-57}),
    'arm-front':variant('L01/arm-brace',105,[.78,.8],{x:48,y:-14,rotation:0}),
    'arm-back':variant('L01/arm-reach',100,[.85,.5],{x:-47,y:-9,rotation:0}),
    'leg-front':variant('L01-LEGS/standing-front',84,[.5,.02],{x:35,y:4}),
    'leg-back':variant('L01-LEGS/standing-back',84,[.5,.02],{x:-29,y:4})};
  clip(o,'fall',[[0,captive(0)],[.35,{...captive(.35),body:{x:266,y:350,rotation:10}}],[.8,crouch],[1,crouch]],[{t:.8,event:'land',attachment:'foot'}]);
  clip(o,'crouch',timed(9,t=>({...crouch,'arm-front':{...crouch['arm-front'],rotation:Math.sin(t*Math.PI*2)*8},head:{...crouch.head,rotation:Math.sin(t*Math.PI*2)*3}})),[],true);o.clips.crouch.duration=1.8;
  clip(o,'stand-up',[[0,crouch],[.4,crouch],[.8,stand],[1,stand]],[{t:.8,event:'standing'}]);
  clip(o,'return',[[0,crouch],[.2,stand],[.65,{...stand,head:{...stand.head,sprite:'L01/head-happy'}}],[1,{}]],[{t:1,event:'return-arrived',attachment:'foot'}]);
  clip(o,'cheer',timed(9,t=>({...idle(t),head:{sprite:'L01/head-happy',rotation:Math.sin(t*Math.PI*2)*3}})),[],true);o.clips.cheer.duration=2.2;
  // These drawings include upper sleeves in the torso. Join the detached sleeves
  // at their actual seam, which is different for reclined, upright and carried poses.
  followSocket(o,'arm-front','torso','near-arm');
  followSocket(o,'arm-back','torso','far-arm');
  followSocket(o,'head','torso','neck');
  o.hands={left:'arm-front',right:'arm-back'};
  register(o);
  register({id:'B05-chair',name:'刘备躺椅',kind:'scenery',anchor:[256,486],canvas:[512,512],nodes:{chair:part('L01/chair',263,486,477,0,[.5,1],undefined,'width')},clips:{idle:{tracks:{},loop:true}},attachments:{seat:{x:273,y:315}}});
}
