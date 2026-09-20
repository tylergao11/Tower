import {createServer} from 'vite';
import fs from 'node:fs/promises';

// Fixed ordinary build orders through the real model; not a player win-rate estimate.
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const {Battle}=await server.ssrLoadModule('/src/game/Battle.ts');
  const {RULES,LEVEL,CARD,ENEMY,createDeck}=await server.ssrLoadModule('/src/config.ts');
  const {position}=await server.ssrLoadModule('/src/game/map.ts');
  const cases=[
    {name:'guanyu',hero:'H01'},
    {name:'zhangfei',hero:'H02'},
    {name:'zhugeliang',hero:'H03'},
    {name:'with-economy',hero:'H01',accounts:2},
    {name:'without-spikes',hero:'H01',omit:'G01'},
    {name:'without-barricades',hero:'H01',omit:'G06'},
    {name:'without-logs',hero:'H01',omit:'M02'},
    {name:'frontline-hero',hero:'H01',frontline:true},
    {name:'hold-before-upper-defense',hero:'H01',lastBuildWave:LEVEL.entries.C.wave-2},
    {name:'compact',hero:'H01',compact:true},
    {name:'compact-economy',hero:'H01',compact:true,accounts:2},
    {name:'compact-four-accounts',hero:'H01',compact:true,accounts:4},
  ];
  const plan=[
    [1,'G02',0,5],[1,'G01',0,3],[1,'G06',0,4],
    [2,'hero',1,4],
    [LEVEL.entries.B.wave-1,'G02',1,4],[LEVEL.entries.B.wave-1,'G06',1,5],[LEVEL.entries.B.wave-1,'G01',1,6],
    [LEVEL.entries.B.wave,'G02',1,2],[LEVEL.entries.B.wave,'M02',1,1],
    [LEVEL.entries.C.wave-1,'G02',2,4],[LEVEL.entries.C.wave-1,'G06',2,3],[LEVEL.entries.C.wave-1,'G01',2,2],[LEVEL.entries.C.wave-1,'M02',2,7],
    [LEVEL.entries.C.wave,'G02',2,1],
  ];
  const reports=[];
  for(const scenario of cases){
    const b=new Battle();b.start(createDeck([scenario.hero]));
    let nextDecision=0,spent=0,peakMoney=b.money,peak=0,lastWave=0,timeAbove999=0;
    const waves=[],deployments=[],sources=new Map(),damage={},built=new Set(),skillCasts=new Set();
    const buildPlan=plan.filter(([wave,card,floor,x])=>wave<=(scenario.lastBuildWave??Infinity)&&(!scenario.compact||!(card==='G02'&&[7,2,1].includes(x)))).map(item=>[...item]);
    if(scenario.frontline){buildPlan.splice(buildPlan.findIndex(item=>item[1]==='hero'),1);buildPlan.unshift([1,'hero',0,4]);}
    const originalDamage=b.damage.bind(b);
    b.damage=(enemy,amount,source,...rest)=>{
      const before=enemy.hp+enemy.shield;
      originalDamage(enemy,amount,source,...rest);
      const card=sources.get(source);
      if(card)damage[card]=(damage[card]||0)+Math.max(0,before-enemy.hp-enemy.shield);
    };
    const place=(id,floor,x)=>{
      if(id===scenario.omit||b.units.some(u=>u.hp>0&&u.def.id===id&&u.floor===floor&&Math.abs(u.home-x)<.2))return false;
      if(!b.deploy(id,floor,x,floor%2?1:-1))return false;
      spent+=CARD[id].cost;
      const unit=b.units.at(-1);sources.set(unit.uid,id);
      deployments.push([+b.time.toFixed(1),id,floor,x]);return true;
    };
    for(let frame=0;frame<60*1200&&b.active;frame++){
      if(b.time>=nextDecision){
        nextDecision=b.time+1;
        let expanding=false;
        for(const [wave,card,floor,x] of buildPlan){
          if(wave>Math.max(1,b.wave))continue;
          const id=card==='hero'?scenario.hero:card,key=[id,floor,x].join(':');
          if(id===scenario.omit||built.has(key))continue;
          expanding=true;
          if(place(id,floor,x))built.add(key);
          else break;
        }
        // Optional economy after securing the starting route.
        if(!expanding){
          if(b.wave>=1&&b.wave<=LEVEL.entries.B.wave)for(const [floor,x] of [[0,6],[1,8],[0,7],[1,2]].slice(0,scenario.accounts??0))place('G04',floor,x);
          for(const [wave,card,floor,x] of buildPlan)if(wave<=Math.max(1,b.wave)&&CARD[card==='hero'?scenario.hero:card].destructible)place(card==='hero'?scenario.hero:card,floor,x);
        }
        for(const unit of b.units)if(unit.def.manual&&unit.cooldown<=0&&unit.ready<=0){
          const ahead=b.enemies.filter(e=>{
            const p=position(e.q);
            return e.hp>0&&!e.hanging&&!p.stairs&&p.floor===unit.floor&&(p.x-unit.x)*unit.facing>0;
          });
          if(ahead.length>=2||ahead.some(e=>e.def.heavy||e.uid===b.lord.carrier))b.command({type:'activate',uid:unit.uid});
        }
        if(b.lord.state==='grabbing')b.command({type:'shield'});
      }
      b.step(RULES.step);
      for(const effect of b.effects)if(effect.hero)skillCasts.add(effect.uid);
      peakMoney=Math.max(peakMoney,b.money);peak=Math.max(peak,b.enemies.filter(e=>e.hp>0).length);
      if(b.money>=999)timeAbove999+=RULES.step;
      if(b.wave!==lastWave){
        lastWave=b.wave;waves.push({wave:b.wave,time:+b.time.toFixed(1),money:b.money,spent});
      }
    }
    const accountIncome=b.units.reduce((n,u)=>n+u.incomePaid,0);
    const report={scenario:scenario.name,result:b.phase,wave:b.wave,time:+b.time.toFixed(1),kills:b.stats.kills,captures:b.stats.captures,losses:b.stats.losses,spent,accountIncome,money:b.money,peakMoney,timeAbove999:+timeAbove999.toFixed(1),peakEnemies:peak,units:b.units.length,upgraded:b.units.filter(u=>u.level>0).length,skillCasts:skillCasts.size,damage:Object.fromEntries(Object.entries(damage).map(([id,value])=>[id,Math.round(value)])),waves};
    if(process.argv.includes('--details'))report.deployments=deployments;
    reports.push(report);console.log(JSON.stringify(process.argv.includes('--details')?report:{...report,waves:undefined}));
  }
  const waves=LEVEL.waves.map(({groups,vitality},i)=>({wave:i+1,vitality,entries:Object.fromEntries(Object.keys(LEVEL.entries).map(entry=>[entry,groups.filter(g=>g.entry===entry).reduce((n,g)=>n+g.count,0)])),count:groups.reduce((n,g)=>n+g.count,0),lastSpawn:Math.max(...groups.map(g=>g.at+(g.count-1)*g.gap)),hp:groups.reduce((n,g)=>n+g.count*Math.round(ENEMY[g.enemy].hp*vitality),0)}));
  const report={waves,totalEnemies:waves.reduce((n,w)=>n+w.count,0),scenarios:reports};
  const output=process.argv.find(v=>v.startsWith('--out='))?.slice(6);
  if(output)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({waves,totalEnemies:report.totalEnemies}));
} finally {await server.close();}
