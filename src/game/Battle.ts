import { CARD, ENEMY, LEVEL, RULES, type CardDef } from '../config';
import { destination, lastColumn, position, routeAt, routeFacing, stride } from './map';
import type { Bag, BattleStats, Command, Effect, Enemy, Lord, Phase, Projectile, Spawn, Unit } from './types';

export class Battle {
  phase: Phase = 'select';
  paused = false;
  time = 0;
  money: number = RULES.money;
  wave = 0;
  waveTime = 0;
  countdown: number = RULES.preparation;
  deck = [...LEVEL.defaultDeck];
  enemies: Enemy[] = [];
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  bags: Bag[] = [];
  effects: Effect[] = [];
  cooldowns: Record<string, number> = {};
  pending: Spawn[] = [];
  focus?: number;
  shieldUses = 1;
  recallUses = 1;
  message = '';
  messageUntil = 0;
  loser = '';
  stats: BattleStats = { captures: 0, rescues: 0, losses: 0, kills: 0, time: 0 };
  lord: Lord = { state: 'idle', ...LEVEL.lord, grace: 0, shield: 0, production: 0, returning: 0 };
  private nextId = 1;

  get active() { return ['prepare', 'wave', 'rest'].includes(this.phase); }
  get perfect() { return this.phase === 'won' && this.stats.captures === 0; }
  get remaining() { return this.pending.length; }
  id() { return this.nextId++; }
  tell(message: string) { this.message = message; this.messageUntil = this.time + 2.5; return false; }

  start(deck: string[]) {
    if (this.phase !== 'select' || deck.length !== LEVEL.deckSize || new Set(deck).size !== deck.length || deck.some(id => !Object.hasOwn(CARD,id))) return false;
    this.deck = [...deck];
    this.phase = 'prepare';
    return true;
  }

  placementError(card: string, floor: number, x: number): string {
    const def = CARD[card];
    if (!Object.hasOwn(CARD,card) || !this.deck.includes(card)) return '未携带';
    if (!this.active || this.paused) return '当前无法布防';
    if (!Number.isInteger(floor) || !Number.isInteger(x) || floor < 0 || floor >= LEVEL.floors || x < 0 || x > lastColumn) return '无法放置';
    if (floor === LEVEL.lord.floor && x === LEVEL.lord.x) return '主公驻守处';
    if (['dropped','grabbing'].includes(this.lord.state) && floor === this.lord.floor && Math.abs(x - this.lord.x) < RULES.meleeRange) return '主公待救处';
    if (x === 0 || x === lastColumn) {
      const entry = Object.values(LEVEL.entries).some(e => e.floor === floor && e.x === x);
      const stairs = (floor > 0 && x === ((floor - 1) % 2 ? 0 : lastColumn)) || (floor < LEVEL.floors - 1 && x === (floor % 2 ? 0 : lastColumn));
      if (def.mobile || (entry && stairs) || def.surfaces.some(s => s !== (entry ? 'ceiling' : 'wall'))) return '保留通道';
    }
    if (def.kind === 'hatch' && floor === 0) return '下方没有通道';
    if (def.mobile && this.units.filter(u => u.hp > 0 && u.floor === floor && u.def.mobile).length >= RULES.guardLimit) return '本层守军已满';
    if (!def.mobile && this.units.some(u => u.hp > 0 && u.floor === floor && u.x === x && u.def.surfaces.some(s => def.surfaces.includes(s)))) return '位置已占用';
    if ((this.cooldowns[card] || 0) > 0) return '尚未冷却';
    if (this.money < def.cost) return '军饷不足';
    return '';
  }

  deploy(card: string, floor: number, x: number, facing = 1) {
    const error = this.placementError(card, floor, x);
    if (error) return this.tell(error);
    const def = CARD[card];
    this.money -= def.cost;
    this.cooldowns[card] = def.cooldown;
    this.units.push({ uid: this.id(), def, floor, x, home: x, hp: def.hp, facing: facing < 0 ? -1 : 1, born: this.time, ready: RULES.buildTime, cooldown: def.manual ? def.interval : 0, production: 0, hit: 0, action: 'idle', actionUntil: 0, pending: 0, openUntil: 0 });
    return true;
  }

  rallyError(uid:number,floor:number,x:number) {
    const unit=this.units.find(u=>u.uid===uid&&u.hp>0);
    if(!this.active||this.paused||!unit?.def.mobile)return '当前无法驻守';
    if(floor!==unit.floor)return '只能在本层驻守';
    if(!Number.isFinite(x)||x<.5||x>lastColumn-(floor===LEVEL.lord.floor?RULES.guardGoalMargin:0))return '无法驻守';
    return '';
  }

  effect(kind: string, floor: number, x: number, value?: number) {
    this.effects.push({ uid: this.id(), kind, floor, x, value, life: .65, maxLife: .65 });
    if (this.effects.length > RULES.effectsLimit) this.effects.shift();
  }

  collect(uid: number) {
    if (!this.active || this.paused) return false;
    const bag = this.bags.find(b => b.uid === uid);
    if (!bag) return false;
    const amount = Math.min(bag.amount, RULES.moneyCap - this.money);
    this.money += amount; bag.amount -= amount;
    if (amount) this.effect('coin', bag.floor, bag.x, amount);
    this.bags = this.bags.filter(b => b.amount > 0);
    return amount > 0;
  }

  command(command: Command): boolean {
    if (!this.active || this.paused) return false;
    if (command.type === 'deploy') return this.deploy(command.card, command.floor, command.x, command.facing);
    if (command.type === 'collect') return this.collect(command.uid);
    if (command.type === 'focus') {
      if (!this.enemies.some(e => e.uid === command.uid && e.hp > 0)) return false;
      this.focus = this.focus === command.uid ? undefined : command.uid; return true;
    }
    if (command.type === 'shield') {
      if (!this.shieldUses || this.lord.shield || !['idle','grabbing'].includes(this.lord.state) || this.lord.floor !== LEVEL.lord.floor || this.lord.x !== LEVEL.lord.x) return this.tell('现在不能护驾');
      this.shieldUses--; this.lord.shield = RULES.shieldHp; this.interruptGrab();
      this.effect('shield', this.lord.floor, this.lord.x); return true;
    }
    if (command.type === 'recall') {
      if (!this.recallUses || this.lord.state !== 'dropped') return this.tell('救下主公后才能回营');
      this.recallUses--; this.returnLord(); return true;
    }
    if (!('uid' in command)) return false;
    const unit = this.units.find(u => u.uid === command.uid && u.hp > 0);
    if (!unit) return false;
    if (command.type === 'sell') {
      this.money = Math.min(RULES.moneyCap, this.money + Math.floor(unit.def.cost * RULES.refund * unit.hp / unit.def.hp));
      this.units = this.units.filter(u => u !== unit); return true;
    }
    if (command.type === 'rally') {
      const error=this.rallyError(unit.uid,unit.floor,command.x);if(error)return this.tell(error);
      unit.home = command.x; return true;
    }
    if (command.type === 'turn') {
      if (unit.def.kind !== 'log' || this.time - unit.born > RULES.faceWindow) return false;
      unit.facing *= -1; return true;
    }
    if (command.type === 'activate') {
      if (!unit.def.manual || unit.ready > 0 || unit.cooldown > 0) return this.tell('尚未装填');
      unit.cooldown = unit.def.interval;
      if (unit.def.kind === 'hammer') unit.pending = RULES.hammerWindup;
      else this.projectiles.push({ uid:this.id(),kind:'log',team:'friendly',source:unit.uid,x:unit.x,y:unit.floor*LEVEL.floorHeight+RULES.bodyHeight,startX:unit.x,startY:unit.floor*LEVEL.floorHeight+RULES.bodyHeight,born:this.time,floor:unit.floor,vx:unit.facing*RULES.logSpeed,vy:0,damage:unit.def.damage,life:10,hitIds:new Set() });
      unit.action='attack'; unit.actionUntil=this.time+RULES.attackPoseTime+(unit.def.kind==='hammer'?RULES.hammerWindup:0); return true;
    }
    return false;
  }

  step(dt: number) {
    if (!this.active || this.paused || !Number.isFinite(dt) || dt <= 0) return;
    this.time += dt; this.stats.time = this.time;
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    for (const e of this.enemies) {
      e.attackCd=Math.max(0,e.attackCd-dt); e.hit=Math.max(0,e.hit-dt); e.slow=0; e.blockedBy=undefined;
      e.controlGrace=Math.max(0,e.controlGrace-dt);
      if(e.stun>0) { e.stun=Math.max(0,e.stun-dt);if(e.stun===0)e.controlGrace=RULES.controlGrace; }
      if(e.poison>0 && e.hp>0) { const elapsed=Math.min(dt,e.poison);e.poison-=elapsed;this.damage(e,RULES.poisonDps*elapsed,0,'poison'); }
      if(e.drop) { e.drop.elapsed+=dt;if(e.drop.elapsed>=RULES.dropTime)e.drop=undefined; }
    }
    this.lord.grace=Math.max(0,this.lord.grace-dt);
    if(this.lord.state==='returning') {
      this.lord.returning-=dt;
      if(this.lord.returning<=0) Object.assign(this.lord,{state:'idle',...LEVEL.lord,returning:0});
    }
    this.production(dt);
    for(const unit of this.units) this.updateUnit(unit,dt);
    this.updateProjectiles(dt);
    for(const enemy of this.enemies) if(enemy.hp>0) this.updateEnemy(enemy,dt);
    this.resolveDeaths();
    const carrier=this.enemies.find(e=>e.uid===this.lord.carrier&&e.hp>0);
    if(carrier && carrier.q<=0) { this.phase='lost';this.lord.state='lost';this.loser=carrier.def.name; }
    if(this.lord.state==='carried'&&carrier) {const p=position(carrier.q);this.lord.floor=p.floor;this.lord.x=p.x;}
    this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
    this.enemies=this.enemies.filter(e=>e.hp>0||this.time-(e.deadAt??this.time)<RULES.enemyDeathDuration);
    if(!this.active) return;
    if(this.phase==='prepare'||this.phase==='rest') {
      this.countdown-=dt;if(this.countdown<=0)this.beginWave();
    } else if(this.phase==='wave') {
      this.waveTime+=dt;
      while(this.pending.length&&this.pending[0].at<=this.waveTime)this.spawn(this.pending.shift()!);
      if(!this.pending.length&&!this.enemies.some(e=>e.hp>0)) {
        if(this.lord.state==='dropped')this.returnLord();
        if(this.wave===LEVEL.waves.length) { if(this.lord.state!=='returning')this.phase='won'; }
        else {this.phase='rest';this.countdown=RULES.intermission;}
      }
    }
  }

  private beginWave() {
    this.wave++;this.waveTime=0;this.phase='wave';
    this.pending=LEVEL.waves[this.wave-1].flatMap(g=>Array.from({length:g.count},(_,i)=>({entry:g.entry,at:g.at+i*g.gap,enemy:g.enemy}))).sort((a,b)=>a.at-b.at);
    while(this.pending.length&&this.pending[0].at<=0)this.spawn(this.pending.shift()!);
  }

  private spawn(spawn: Spawn) {
    const entry=LEVEL.entries[spawn.entry],def=ENEMY[spawn.enemy];
    this.enemies.push({uid:this.id(),def,q:routeAt(entry.floor,entry.x),hp:def.hp,shield:def.shield||0,face:entry.floor%2?-1:1,hanging:!!def.climb,landing:0,action:'walk',actionUntil:0,attackCd:0,grab:0,stun:0,controlGrace:0,poison:0,slow:0,hit:0});
  }

  private production(dt:number) {
    const produce=(source:number,floor:number,x:number,amount:number)=>this.bags.push({uid:this.id(),source,floor,x,amount});
    if(this.lord.state==='idle'&&this.bags.filter(b=>b.source===0).length<RULES.bagLimit) {
      this.lord.production+=dt;
      if(this.lord.production>=RULES.lordInterval){this.lord.production-=RULES.lordInterval;produce(0,this.lord.floor,this.lord.x,RULES.lordIncome);}
    }
    for(const u of this.units)if(u.def.income&&u.ready<=0&&u.hp>0&&this.bags.filter(b=>b.source===u.uid).length<RULES.bagLimit){
      u.production+=dt;if(u.production>=u.def.interval){u.production-=u.def.interval;produce(u.uid,u.floor,u.x,u.def.income);}
    }
  }

  private interruptGrab() {
    const grabber=this.enemies.find(e=>e.uid===this.lord.grabber);
    if(grabber)grabber.grab=0;
    if(this.lord.state==='grabbing')this.lord.state=this.lord.floor===LEVEL.lord.floor&&this.lord.x===LEVEL.lord.x?'idle':'dropped';
    this.lord.grabber=undefined;
  }

  private returnLord() {
    this.interruptGrab();this.lord.state='returning';this.lord.returning=RULES.recallTime;
    this.lord.carrier=undefined;this.effect('rescue',this.lord.floor,this.lord.x);
  }

  private damage(enemy:Enemy,amount:number,source:number,kind:'physical'|'poison'='physical',projectile?:Projectile) {
    if(enemy.hp<=0)return;
    if(projectile&&enemy.shield>0&&kind==='physical'&&projectile.vx*enemy.face<0&&Math.abs(projectile.vx)>=Math.abs(projectile.vy)&&Math.abs(projectile.y-this.enemyY(enemy))<RULES.meleeRange){
      const absorbed=Math.min(enemy.shield,amount);enemy.shield-=absorbed;amount-=absorbed;
      const p=position(enemy.q);this.effect('block',p.floor,p.x);
    }
    enemy.hp-=amount*(kind==='physical'?1-(enemy.def.armor||0):1);
    if(amount>0){enemy.hit=RULES.hitFlash;if(source)enemy.lastAttacker=source;}
    if(enemy.hp<=0){enemy.hp=0;enemy.deadAt=this.time;enemy.action='dead';this.stats.kills++;const p=position(enemy.q);this.bags.push({uid:this.id(),source:-enemy.uid,floor:p.floor,x:p.x,amount:enemy.def.reward});}
  }

  private resolveDeaths() {
    if(this.lord.grabber&&this.enemies.find(e=>e.uid===this.lord.grabber)?.hp===0)this.interruptGrab();
    const carrier=this.enemies.find(e=>e.uid===this.lord.carrier);
    if(carrier&&carrier.hp<=0&&this.lord.state==='carried'){
      const p=position(carrier.q);Object.assign(this.lord,{state:'dropped',floor:p.floor,x:p.x,carrier:undefined,grace:RULES.rescueGrace});
      this.stats.rescues++;this.effect('rescue',p.floor,p.x);this.tell('主公已救下');
    }
    for(const u of this.units)if(u.hp<=0){if(!u.def.mobile)this.stats.losses++;this.effect('break',u.floor,u.x);}
    this.units=this.units.filter(u=>u.hp>0);
  }

  private enemyY(e:Enemy) {const p=position(e.q);return p.elevation*LEVEL.floorHeight+(e.hanging?RULES.hangingHeight:RULES.bodyHeight);}
  private unitY(u:Unit) {return u.floor*LEVEL.floorHeight+(u.def.surfaces.includes('ceiling')?RULES.hangingHeight:RULES.bodyHeight);}

  private stun(e:Enemy,duration:number) {
    if(e.controlGrace>0)return;
    e.stun=Math.max(e.stun,duration*(e.def.heavy?RULES.heavyControlScale:1));
    if(this.lord.grabber===e.uid)this.interruptGrab();
  }

  private drop(e:Enemy) {
    const p=position(e.q);if(p.floor===0||e.drop)return;
    if(this.lord.grabber===e.uid)this.interruptGrab();
    e.q=routeAt(p.floor-1,p.x);e.hanging=false;e.drop={fromFloor:p.floor,toFloor:p.floor-1,elapsed:0};
    e.action='fall';
  }

  private targetScore(e:Enemy,unit:Unit) {
    return (this.focus===e.uid?-10000:0)+(this.lord.carrier===e.uid?-5000:0)+(this.lord.grabber===e.uid?-2000:0)+Math.abs(routeAt(this.lord.floor,this.lord.x)-e.q)+Math.abs(position(e.q).x-unit.x)*.001;
  }

  private targets(u:Unit,range=u.def.range,groundOnly=false) {
    return this.enemies.filter(e=>{
      if(e.hp<=0||e.drop||(groundOnly&&e.hanging))return false;
      const p=position(e.q);
      if(u.def.kind==='ballista')return Math.hypot(p.x-u.x,this.enemyY(e)-this.unitY(u))<=range&&this.lineClear(u.x,this.unitY(u),p.x,this.enemyY(e));
      return !p.stairs&&p.floor===u.floor&&Math.abs(p.x-u.x)<=range;
    }).sort((a,b)=>this.targetScore(a,u)-this.targetScore(b,u));
  }

  private opening(upperFloor:number,x:number) {
    const stairX=(upperFloor-1)%2===0?lastColumn:0;
    return Math.abs(x-stairX)<.45||this.units.some(u=>u.def.kind==='hatch'&&u.floor===upperFloor&&Math.abs(u.x-x)<.45&&u.openUntil>this.time&&u.hp>0);
  }

  private lineClear(x1:number,y1:number,x2:number,y2:number) {
    for(let floor=1;floor<LEVEL.floors;floor++){
      const boundary=floor*LEVEL.floorHeight;
      if(y1!==y2&&(y1-boundary)*(y2-boundary)<=0){const x=x1+(x2-x1)*(boundary-y1)/(y2-y1);if(!this.opening(floor,x))return false;}
    }
    return true;
  }

  private updateUnit(u:Unit,dt:number) {
    if(u.hp<=0)return;
    u.hit=Math.max(0,u.hit-dt);
    if(u.ready>0){u.ready=Math.max(0,u.ready-dt);return;}
    u.cooldown=Math.max(0,u.cooldown-dt);
    if(this.time>=u.actionUntil)u.action='idle';
    if(u.pending>0){
      u.pending-=dt;
      if(u.pending<=0){for(const e of this.targets(u)){this.damage(e,u.def.damage,u.uid);this.stun(e,RULES.hammerStun);}this.effect('slam',u.floor,u.x);}
    }
    if(u.def.mobile){this.updateGuard(u,dt);return;}
    if(u.def.kind==='wind'){for(const e of this.targets(u))e.slow=Math.max(e.slow,RULES.windSlow);return;}
    if(u.def.manual||u.cooldown>0||['income','barricade'].includes(u.def.kind))return;
    if(u.def.kind==='poison'){
      this.projectiles.push({uid:this.id(),kind:'poison',team:'friendly',source:u.uid,x:u.x,y:this.unitY(u),startX:u.x,startY:this.unitY(u),born:this.time,floor:u.floor,vx:0,vy:-RULES.poisonSpeed,damage:u.def.damage,life:5,hitIds:new Set()});
      u.cooldown=u.def.interval;u.action='attack';u.actionUntil=this.time+RULES.attackPoseTime;return;
    }
    const targets=this.targets(u,u.def.range,['spikes','hatch'].includes(u.def.kind));
    const target=targets[0];if(!target)return;
    u.cooldown=u.def.interval;u.action='attack';u.actionUntil=this.time+RULES.attackPoseTime;
    if(u.def.kind==='spikes'){for(const e of targets)this.damage(e,u.def.damage,u.uid);this.effect('hit',u.floor,u.x);}
    else if(u.def.kind==='ballista'){
      const p=position(target.q);u.facing=p.x>=u.x?1:-1;
      this.shoot(u.x,this.unitY(u),p.x,this.enemyY(target),u.def.damage,u.uid,'friendly');
    } else if(u.def.kind==='hook'){
      if(target.shield>0){target.shield=0;this.effect('shield-break',u.floor,position(target.q).x);}
      this.damage(target,u.def.damage,u.uid);this.effect('hook',u.floor,position(target.q).x);
    } else if(u.def.kind==='hatch'){u.openUntil=this.time+RULES.hatchOpen;u.action='open';this.drop(target);}
  }

  private updateGuard(u:Unit,dt:number) {
    u.blockedEnemy=undefined;
    if(u.def.kind==='medic'){
      const injured=this.units.filter(t=>t.floor===u.floor&&t.hp>0&&t.ready<=0&&t.hp<t.def.hp).sort((a,b)=>a.hp/a.def.hp-b.hp/b.def.hp);
      const target=injured[0];
      if(target){
        if(Math.abs(target.x-u.x)<=u.def.range){
          if(u.cooldown<=0){target.hp=Math.min(target.def.hp,target.hp+RULES.healing);u.cooldown=u.def.interval;u.action='heal';u.actionUntil=this.time+RULES.attackPoseTime;this.effect('heal',target.floor,target.x,RULES.healing);}
        }else this.moveGuard(u,target.x,dt);
      }else this.moveGuard(u,u.home,dt);
      return;
    }
    const target=this.enemies.filter(e=>{
      const p=position(e.q);return e.hp>0&&!e.hanging&&!e.drop&&!p.stairs&&p.floor===u.floor&&(Math.abs(p.x-u.home)<=RULES.guardPatrol||e.uid===this.lord.carrier);
    }).sort((a,b)=>this.targetScore(a,u)-this.targetScore(b,u))[0];
    if(!target){this.moveGuard(u,u.home,dt);return;}
    const p=position(target.q);
    if(Math.abs(p.x-u.x)>u.def.range){this.moveGuard(u,p.x,dt);return;}
    u.facing=p.x>=u.x?1:-1;
    if(!target.blockedBy){target.blockedBy=u.uid;u.blockedEnemy=target.uid;}
    if(u.cooldown<=0){this.damage(target,u.def.damage,u.uid);u.cooldown=u.def.interval;u.action='attack';u.actionUntil=this.time+RULES.attackPoseTime;}
  }

  private moveGuard(u:Unit,to:number,dt:number) {
    const max=lastColumn-(u.floor===LEVEL.lord.floor?RULES.guardGoalMargin:0);
    to=Math.max(.5,Math.min(max,to));
    if(Math.abs(to-u.x)<.02)return;
    u.facing=Math.sign(to-u.x);u.x+=u.facing*Math.min(Math.abs(to-u.x),(u.def.speed||0)*dt);u.action='walk';
  }

  private shoot(x:number,y:number,tx:number,ty:number,damage:number,source:number,team:'friendly'|'enemy') {
    const length=Math.hypot(tx-x,ty-y)||1;
    this.projectiles.push({uid:this.id(),kind:'arrow',team,source,x,y,startX:x,startY:y,born:this.time,vx:(tx-x)/length*RULES.arrowSpeed,vy:(ty-y)/length*RULES.arrowSpeed,damage,floor:Math.floor(y/LEVEL.floorHeight),life:3,hitIds:new Set()});
  }

  private updateProjectiles(dt:number) {
    for(const shot of this.projectiles){
      let ox=shot.x,oy=shot.y;
      shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;
      if(shot.x<-.5||shot.x>lastColumn+.5||shot.y<0){shot.life=0;continue;}
      if(shot.kind==='log'){
        const hatch=this.units.find(u=>u.hp>0&&u.floor===shot.floor&&u.def.kind==='hatch'&&u.openUntil>this.time&&Math.abs(u.x-shot.x)<u.def.range);
        if(hatch&&shot.floor>0){shot.floor--;shot.y=shot.floor*LEVEL.floorHeight+RULES.bodyHeight;ox=shot.x;oy=shot.y;}
      }else if(!this.lineClear(ox,oy,shot.x,shot.y)){shot.life=0;continue;}
      const segmentDistance=(x:number,y:number)=>{
        const dx=shot.x-ox,dy=shot.y-oy,l=dx*dx+dy*dy;
        const t=l?Math.max(0,Math.min(1,((x-ox)*dx+(y-oy)*dy)/l)):0;
        return Math.hypot(x-ox-t*dx,y-oy-t*dy);
      };
      if(shot.team==='friendly'){
        const hits=this.enemies.filter(e=>{
          const p=position(e.q);
          return e.hp>0&&!e.drop&&!shot.hitIds.has(e.uid)&&!(shot.kind==='log'&&(e.hanging||p.stairs||p.floor!==shot.floor))&&segmentDistance(p.x,this.enemyY(e))<RULES.hitRadius;
        }).sort((a,b)=>Math.hypot(position(a.q).x-ox,this.enemyY(a)-oy)-Math.hypot(position(b.q).x-ox,this.enemyY(b)-oy));
        for(const e of hits){
          shot.hitIds.add(e.uid);
          this.damage(e,shot.damage,shot.source,shot.kind==='poison'?'poison':'physical',shot.kind==='arrow'?shot:undefined);
          this.effect(shot.kind==='poison'?'poison':'hit',position(e.q).floor,position(e.q).x);
          if(shot.kind==='poison')e.poison=Math.max(e.poison,RULES.poisonDuration);
          if(shot.kind==='log'){
            const p=position(e.q),x=Math.max(0,Math.min(lastColumn,p.x+Math.sign(shot.vx)*RULES.logPush));
            if(this.lord.grabber===e.uid)this.interruptGrab();
            e.q=routeAt(p.floor,x);
            if(this.units.some(u=>u.hp>0&&u.def.kind==='hatch'&&u.floor===p.floor&&u.openUntil>this.time&&u.x>=Math.min(p.x,x)&&u.x<=Math.max(p.x,x)))this.drop(e);
          }else {shot.life=0;break;}
        }
      }else{
        const target=this.units.filter(u=>u.hp>0&&u.ready<=0&&segmentDistance(u.x,this.unitY(u))<RULES.hitRadius).sort((a,b)=>Math.abs(a.x-ox)-Math.abs(b.x-ox))[0];
        if(target){target.hp-=shot.damage;target.hit=RULES.hitFlash;shot.life=0;}
      }
    }
    this.projectiles=this.projectiles.filter(p=>p.life>0);
  }

  private updateEnemy(e:Enemy,dt:number) {
    if(e.stun>0||e.drop){e.action=e.drop?'fall':'hit';if(this.lord.grabber===e.uid)this.interruptGrab();return;}
    const p=position(e.q),carrying=this.lord.carrier===e.uid;
    const goal=carrying?0:routeAt(this.lord.floor,this.lord.x);
    const routeDirection=Math.sign(goal-e.q);
    e.face=routeFacing(e.q,routeDirection);
    if(e.def.climb&&!carrying&&Math.abs(goal-e.q)>1&&!p.stairs)e.hanging=true;
    if(carrying)e.hanging=false;
    if(this.time>=e.actionUntil)e.action=e.hanging?'climb':carrying?'carry':'walk';
    const guards=this.units.filter(u=>u.hp>0&&u.ready<=0&&u.floor===p.floor);
    const barrier=!e.hanging&&!p.stairs?guards.find(u=>u.def.kind==='barricade'&&Math.abs(u.x-p.x)<=RULES.meleeRange&&((u.x-p.x)*e.face>=-.1)):undefined;
    const blocker=barrier||guards.find(u=>u.uid===e.blockedBy);
    let attackTarget=blocker;
    let range:number=RULES.meleeRange;
    if(!attackTarget&&!carrying&&!p.stairs){
      if(e.def.engineer){
        attackTarget=guards.filter(u=>!u.def.mobile&&!u.def.surfaces.includes('ceiling')&&(u.x-p.x)*e.face>=-.1&&Math.abs(u.x-p.x)<=RULES.engineerRange).sort((a,b)=>(a.def.kind==='income'?-1:0)-(b.def.kind==='income'?-1:0)||Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
      }else if(e.def.ranged){
        range=RULES.archerRange;
        attackTarget=guards.filter(u=>Math.hypot(u.x-p.x,this.unitY(u)-this.enemyY(e))<=range).sort((a,b)=>(a.uid===e.lastAttacker?-1:0)-(b.uid===e.lastAttacker?-1:0)||Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
      }
    }
    if(attackTarget){
      if(this.lord.grabber===e.uid)this.interruptGrab();
      const distance=Math.abs(attackTarget.x-p.x);
      if(distance>range){this.moveEnemy(e,routeAt(attackTarget.floor,attackTarget.x),dt,carrying);return;}
      e.face=Math.sign(attackTarget.x-p.x)||e.face;e.action='attack';
      if(e.attackCd<=0){
        e.attackCd=e.def.interval;e.actionUntil=this.time+RULES.attackPoseTime;
        const damage=e.def.engineer?(attackTarget.def.mobile?RULES.engineerGuardDamage:RULES.engineerDamage):e.def.damage;
        if(e.def.ranged)this.shoot(p.x,this.enemyY(e),attackTarget.x,this.unitY(attackTarget),damage,e.uid,'enemy');
        else {attackTarget.hp-=damage;attackTarget.hit=RULES.hitFlash;}
      }
      return;
    }
    if(!carrying&&Math.abs(goal-e.q)<=RULES.captureRange){
      if(this.lord.state==='returning'||this.lord.state==='carried'||this.lord.grace>0){e.action='idle';return;}
      if(e.hanging){e.hanging=false;e.landing=RULES.scoutLandTime;}
      if(e.landing>0){e.landing=Math.max(0,e.landing-dt);e.action='fall';return;}
      if(this.lord.shield>0){
        e.action='attack';if(e.attackCd<=0){e.attackCd=e.def.interval;this.lord.shield=Math.max(0,this.lord.shield-(e.def.engineer?RULES.engineerDamage:e.def.damage));this.effect('shield',p.floor,p.x);}return;
      }
      if(this.lord.grabber&&this.lord.grabber!==e.uid){e.action='idle';return;}
      this.lord.grabber=e.uid;this.lord.state='grabbing';e.action='grab';e.grab+=dt;
      if(e.grab>=RULES.captureTime){this.lord.state='carried';this.lord.carrier=e.uid;this.lord.grabber=undefined;this.lord.shield=0;this.stats.captures++;e.grab=0;e.hanging=false;this.tell('主公被抓了');}
      return;
    }
    if(this.lord.grabber===e.uid)this.interruptGrab();
    this.moveEnemy(e,goal,dt,carrying);
  }

  private moveEnemy(e:Enemy,goal:number,dt:number,carrying:boolean) {
    const direction=Math.sign(goal-e.q);if(!direction){e.action='idle';return;}
    const p=position(e.q+direction*.00001);
    let speed=p.stairs?1/(e.def.climb&&!carrying?RULES.scoutStairsTime:RULES.stairsTime):e.def.speed;
    speed*=Math.max(RULES.minimumSpeed,1-e.slow)*(carrying?RULES.carrySpeed:1);
    const amount=Math.min(Math.abs(goal-e.q),speed*dt);
    e.q=Math.max(0,Math.min(destination,e.q+direction*amount));
    e.face=routeFacing(e.q,direction);
    e.action=carrying?'carry':e.hanging?'climb':'walk';
  }
}
