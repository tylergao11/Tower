import {createServer} from 'vite';
import fs from 'node:fs/promises';

// Exercise the real battle model without rendering or wall-clock waits.
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const {Battle}=await server.ssrLoadModule('/src/game/Battle.ts');
  const {RULES,LEVEL,CARD,ENEMY}=await server.ssrLoadModule('/src/config.ts');
  const {position}=await server.ssrLoadModule('/src/game/map.ts');
  const cases=[
    {name:'heroes-only',deck:['H01','H02','H03','G02','G04','S02','M02','G06'],mode:'heroes'},
    {name:'mixed-defense',deck:['H01','H03','S02','G02','G04','M02','G06','G08'],mode:'mixed'},
    {name:'traps-defense',deck:['H02','S01','S02','G02','G04','M01','G06','G08'],mode:'traps'},
  ];
  const reports=[];
  for(const scenario of cases){
    const b=new Battle();if(!b.start(scenario.deck))throw Error('Invalid simulation deck');
    let nextDecision=0,peak=0,spent=0,transitions=[],lastWave=0,deployments=[];
    const place=(id,floor,x)=>{
      if(b.units.some(u=>u.hp>0&&u.def.id===id&&u.floor===floor&&Math.abs(u.home-x)<.2))return false;
      if(b.deploy(id,floor,x,floor%2?-1:1)){spent+=CARD[id].cost;deployments.push([+b.time.toFixed(1),id,floor,x]);return true;}return false;
    };
    for(let frame=0;frame<60*1200&&b.active;frame++){
      if(b.time>=nextDecision){
        nextDecision=b.time+.5;
        for(const bag of [...b.bags])b.collect(bag.uid);
        if(scenario.mode==='heroes'){
          place('H01',2,6);place('H02',2,6);place('H03',2,7);
        }else{
          const tanks=scenario.mode==='mixed'?['H01','H03']:['H02','S01'];
          // Opening investment, followed by a layered main defense near the lord.
          if(b.units.filter(u=>u.def.kind==='income').length<3){
            for(const x of [7,8,5])if(place('G04',1,x))break;
          }
          place(tanks[0],2,5);place(tanks[1],2,6);place('S02',2,7);
          for(const [id,floor,x] of [
            ['G02',2,6],['G02',2,7],['G08',2,4],['G06',2,4],
            ['G02',2,5],['G02',2,3],['G08',2,6],
            [scenario.mode==='mixed'?'M02':'M01',2,2],
            ['G02',1,4],['G02',1,5],['G06',1,6],['G08',1,6],
            ['G02',0,6],['G02',0,7],['G06',0,5],['G08',0,5],
          ])place(id,floor,x);
          for(const unit of b.units)if(unit.def.manual&&unit.cooldown<=0&&unit.ready<=0){
            const near=b.enemies.filter(e=>e.hp>0&&position(e.q).floor===unit.floor&&!e.hanging);
            if(near.some(e=>Math.abs(position(e.q).x-unit.x)<(unit.def.kind==='hammer'?.5:9)))b.command({type:'activate',uid:unit.uid});
          }
          const threat=b.enemies.filter(e=>e.hp>0).sort((a,z)=>z.q-a.q)[0];
          if(threat&&threat.uid!==b.focus)b.command({type:'focus',uid:threat.uid});
        }
        if(b.lord.state==='grabbing')b.command({type:'shield'});
      }
      b.step(RULES.step);peak=Math.max(peak,b.enemies.filter(e=>e.hp>0).length);
      if(b.wave!==lastWave){lastWave=b.wave;transitions.push([b.wave,+b.time.toFixed(1)]);}
    }
    const report={scenario:scenario.name,result:b.phase,wave:b.wave,time:+b.time.toFixed(1),kills:b.stats.kills,captures:b.stats.captures,losses:b.stats.losses,spent,peakEnemies:peak,units:b.units.length,transitions};
    if(process.argv.includes('--details'))report.deployments=deployments;
    reports.push(report);console.log(JSON.stringify(report));
  }
  const waves=LEVEL.waves.map((groups,i)=>({wave:i+1,count:groups.reduce((n,g)=>n+g.count,0),lastSpawn:Math.max(...groups.map(g=>g.at+(g.count-1)*g.gap)),hp:groups.reduce((n,g)=>n+g.count*ENEMY[g.enemy].hp,0)}));
  const report={waves,totalEnemies:waves.reduce((n,w)=>n+w.count,0),spawnScheduleMinimum:RULES.preparation+waves.reduce((n,w)=>n+w.lastSpawn,0)+(waves.length-1)*RULES.intermission,scenarios:reports};
  const output=process.argv.find(v=>v.startsWith('--out='))?.slice(6);
  if(output)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({totalEnemies:report.totalEnemies,spawnScheduleMinimum:report.spawnScheduleMinimum}));
} finally {await server.close();}
