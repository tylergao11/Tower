import assetManifest from '../assets/game/asset-manifest.json';
import { STAGE_WIDTH, STAGE_HEIGHT } from './viewport';
export type Surface = 'ground' | 'wall' | 'ceiling';
export type CardKind = 'spikes' | 'ballista' | 'poison' | 'income' | 'wind' | 'barricade' | 'hatch' | 'hook' | 'hammer' | 'log' | 'guard' | 'medic';
export type HeroKind = 'guanyu'|'zhangfei'|'zhugeliang';
export const HERO_SKILLS:Record<HeroKind,{name:string;line:string;range:number;damageScale:number;stun:number;push:number;color:number;ink:string}> = {
  guanyu:{name:'青龙偃月',line:'青龙所至，敌阵皆破！',range:2.4,damageScale:2.6,stun:0,push:0,color:0x83ed8c,ink:'#215531'},
  zhangfei:{name:'长坂怒吼',line:'燕人张翼德在此！',range:2.1,damageScale:2,stun:.85,push:0,color:0xffae59,ink:'#922c1c'},
  zhugeliang:{name:'借东风',line:'东风已至，破阵！',range:3.4,damageScale:2.2,stun:.35,push:.55,color:0xa6eaff,ink:'#235977'},
};
export interface CardDef {
  id: string; name: string; kind: CardKind; cost: number; hp: number; cooldown: number; destructible: boolean;
  surfaces: Surface[]; interval: number; range: number; damage: number; tip: string;
  manual?: boolean; mobile?: boolean; speed?: number; income?: number; initialReload?: number;
  pierce?:number; pierceFalloff?:number;
  upgrades?: CardUpgrade[];
  hero?: HeroKind;
}
export interface CardUpgrade {
  kills:number; damage?:number; hp?:number; interval?:number; range?:number; pierce?:number;
}
export interface EnemyDef {
  id: string; name: string; hp: number; speed: number; damage: number; interval: number; reward: number;
  shield?: number; armor?: number; heavy?: boolean; climb?: boolean; engineer?: boolean; ranged?: boolean; boss?: boolean;
  thief?:boolean; title?:string; line?:string;
}
export const RULES = {
  step: 1 / 60, maxFrameSeconds: .15, money: 450, lordIncome: 30, lordInterval: 5, lordWaveSupply: 150,
  preparation: 8, intermission: 3, entryWarning: 6, incomeEffectDuration: .85,
  movementSpeedScale: .65,
  incomeRateScale: 1,
  captureTime: 1.2, rescueGrace: 1.5, carryMoveSpeed: .32, carryAnimationDuration: 1, refund: .4, buildTime: .6,
  faceWindow: 3, guardLimit: 3, meleeRange: .6, captureRange: .4, guardPatrol: 2,
  stairsTime: 1.5, scoutStairsTime: .35, scoutLandTime: .6, controlGrace: .8, heavyControlScale: .5,
  minimumSpeed: .25, windSlow: .4, poisonDps: 6, poisonDuration: 4, hatchOpen: .6,
  hammerWindup: .35, hammerStun: .8, logSpeed: 4, logPush: 1, shieldHp: 250, recallTime: 1,
  engineerRange: 1.5, engineerDamage: 30, engineerGuardDamage: 5, archerRange: 3,
  arrowSpeed: 9, poisonSpeed: 4, hitRadius: .3, dropTime: .42, hitFlash: .16,
  healing: 18, bodyHeight: .42, hangingHeight: 1.45, guardGoalMargin: .65,
  effectsLimit: 100, enemyDeathDuration: .4, attackPoseTime: .35,
  combatReleaseMargin:.18, facingDeadzone:.05, heroPatrol:3.5, heroSkillInterval:3.5, heroSkillPoseTime:.7, heroSkillEffectTime:1.6,
  thiefSteal:12, thiefCapacity:36, bossArrivalDuration:2.8, promotionDuration:1.4,
} as const;
export const CARDS: CardDef[] = [
  { id:'H01',name:'关羽',kind:'guard',hero:'guanyu',cost:200,hp:420,destructible:true,cooldown:15,surfaces:[],interval:1.15,range:.8,damage:34,mobile:true,speed:1.25,tip:'' },
  { id:'H02',name:'张飞',kind:'guard',hero:'zhangfei',cost:180,hp:520,destructible:true,cooldown:15,surfaces:[],interval:1.3,range:.7,damage:30,mobile:true,speed:1.15,tip:'' },
  { id:'H03',name:'诸葛亮',kind:'guard',hero:'zhugeliang',cost:180,hp:240,destructible:true,cooldown:15,surfaces:[],interval:1.4,range:2.8,damage:22,mobile:true,speed:1,tip:'' },
  { id:'G01',name:'地刺',kind:'spikes',cost:65,hp:150,destructible:false,cooldown:3,surfaces:['ground'],interval:1,range:.55,damage:70,tip:'',upgrades:[{kills:6,damage:115,range:.65},{kills:16,damage:185,range:.75,interval:.9}] },
  { id:'G02',name:'连弩车',kind:'ballista',cost:140,hp:120,destructible:false,cooldown:5,surfaces:['ground','wall'],interval:1.6,range:6.5,damage:36,pierce:3,pierceFalloff:.85,tip:'',upgrades:[{kills:6,damage:64,interval:1.5,pierce:4},{kills:16,damage:108,interval:1.4,range:7.5,pierce:5}] },
  { id:'G03',name:'悬毒壶',kind:'poison',cost:100,hp:80,destructible:false,cooldown:6,surfaces:['ceiling'],interval:2,range:.35,damage:6,tip:'向下滴毒，持续伤敌' },
  { id:'G04',name:'军饷库',kind:'income',cost:90,hp:200,destructible:true,cooldown:6,surfaces:['ground','wall'],interval:5,range:0,damage:0,income:8,tip:'' },
  { id:'G05',name:'寒风机关',kind:'wind',cost:90,hp:100,destructible:false,cooldown:5,surfaces:['wall'],interval:0,range:1.2,damage:0,tip:'减缓附近敌军' },
  { id:'G06',name:'拒马',kind:'barricade',cost:45,hp:700,destructible:true,cooldown:6,surfaces:['ground'],interval:0,range:0,damage:0,tip:'拦住地面敌群；拦截助攻可升级，工兵克制',upgrades:[{kills:6,hp:1300},{kills:16,hp:2300}] },
  { id:'G07',name:'翻板',kind:'hatch',cost:140,hp:100,destructible:false,cooldown:10,surfaces:['ground'],interval:6,range:.4,damage:0,tip:'把一名敌军送往下层' },
  { id:'G08',name:'破甲钩爪',kind:'hook',cost:130,hp:100,destructible:false,cooldown:8,surfaces:['ceiling'],interval:1.8,range:1.2,damage:16,tip:'剥除盾牌，攻击攀顶敌军' },
  { id:'M01',name:'悬锤',kind:'hammer',cost:150,hp:160,destructible:false,cooldown:10,surfaces:['ceiling'],interval:8,range:.5,damage:110,manual:true,tip:'手动落锤，击晕敌军' },
  { id:'M02',name:'滚木架',kind:'log',cost:140,hp:160,destructible:false,cooldown:10,surfaces:['ground','wall'],interval:10,initialReload:0,range:9,damage:160,manual:true,tip:'',upgrades:[{kills:4,damage:280,interval:9},{kills:10,damage:460,interval:8}] },
  { id:'S01',name:'刀盾亲卫',kind:'guard',cost:100,hp:220,destructible:true,cooldown:8,surfaces:[],interval:.9,range:.6,damage:16,mobile:true,speed:.9,tip:'迎敌并拦截一名地面敌军' },
  { id:'S02',name:'军医匠',kind:'medic',cost:120,hp:140,destructible:true,cooldown:10,surfaces:[],interval:1.5,range:2,damage:0,mobile:true,speed:.8,tip:'治疗守军，维修拒马' },
];
function cardTip(card:CardDef):string {
  if(card.hero){
    const skill=HERO_SKILLS[card.hero];
    return `${skill.name} · 每${RULES.heroSkillInterval}秒${skill.push?'击退':skill.stun?'震晕':'横扫'}${skill.range}格内敌军`;
  }
  if(card.income)return `每${card.interval/RULES.incomeRateScale}秒产出${card.income}军饷；可被攻击，注意防刺客`;
  if(card.kind==='spikes')return `每${card.interval}秒群伤${card.damage}，范围${card.range}格`;
  if(card.kind==='ballista')return `射程${card.range}格，伤害${card.damage}，穿透${card.pierce}人，可对空`;
  if(card.kind==='log')return `建成可发动，伤害${card.damage}并击退；装填${card.interval}秒`;
  return card.tip;
}
for(const card of CARDS)card.tip=cardTip(card);
export const CARD = Object.fromEntries(CARDS.map(c => [c.id,c])) as Record<string,CardDef>;
/** Derive an instance's stats from the same tiers used by the upgrade preview. */
export function cardAtLevel(id:string,level:number):CardDef {
  const base=CARD[id],result={...base};
  for(const {kills:_,...stats} of base.upgrades?.slice(0,level)??[])Object.assign(result,stats);
  result.tip=cardTip(result);
  return result;
}
export function upgradeSummary(current:CardDef,next:CardDef):string {
  const fields=[['damage','伤害'],['hp','耐久'],['range','范围'],['interval','间隔'],['income','每次军饷'],['pierce','穿透人数']] as const;
  return fields.filter(([key])=>current[key]!==next[key]).map(([key,label])=>`${label} ${current[key]}→${next[key]}`).join(' · ');
}
export const ENEMIES: EnemyDef[] = [
  { id:'E01',name:'曹军步卒',hp:130,speed:.65,damage:10,interval:1,reward:5 },
  { id:'E02',name:'盾兵',hp:195,speed:.5,damage:14,interval:1.2,reward:8,shield:100 },
  { id:'E03',name:'破械工兵',hp:130,speed:.6,damage:5,interval:1,reward:8,engineer:true },
  { id:'E04',name:'飞檐刺客',hp:117,speed:1,damage:14,interval:1,reward:8,climb:true,thief:true },
  { id:'E05',name:'敌军弓手',hp:156,speed:.55,damage:14,interval:1.6,reward:8,ranged:true },
  { id:'E06',name:'重甲虎卫',hp:585,speed:.38,damage:35,interval:1.5,reward:20,armor:.25,heavy:true },
  { id:'E07',name:'曹洪',title:'破城先锋',line:'踏平新野！把刘备交出来！',hp:1170,speed:.4,damage:45,interval:1.5,reward:40,armor:.25,heavy:true,boss:true },
];
export const ENEMY = Object.fromEntries(ENEMIES.map(e => [e.id,e])) as Record<string,EnemyDef>;
export interface SpawnGroup { entry:'A'|'B'|'C'; at:number; enemy:string; count:number; gap:number }
const group=(entry:SpawnGroup['entry'],at:number,enemy:string,count:number,gap:number):SpawnGroup=>({entry,at,enemy,count,gap});
export interface WaveDef { name?:string; vitality:number; groups:SpawnGroup[] }
const wave=(vitality:number,...groups:SpawnGroup[]):WaveDef=>({vitality,groups});
export const LEVEL = {
  id:'xinye', name:'新野', columns:10, floors:3, floorHeight:2,
  loadout:{heroes:['H01','H02','H03'],fixedCards:['G01','G02','G06','G04','M02']},
  lord:{floor:2,x:6.3},
  entries:{ A:{floor:0,x:0,wave:1,name:'城外'}, B:{floor:1,x:9,wave:3,name:'城门'}, C:{floor:2,x:0,wave:5,name:'营地'} },
  waves:[
    wave(1,group('A',0,'E01',6,2)),
    wave(1.1,group('A',0,'E01',8,2),group('A',4,'E02',2,6),group('A',8,'E03',2,6)),
    wave(1.2,
      group('A',0,'E01',4,2),group('A',2,'E02',2,4),
      group('B',RULES.entryWarning,'E01',7,2),group('B',8,'E02',3,4),group('B',12,'E05',2,6)),
    wave(1.45,
      group('A',0,'E01',4,2),group('A',2,'E02',2,4),
      group('B',0,'E01',7,2),group('B',2,'E02',3,4),group('B',8,'E03',2,5),group('B',12,'E04',2,5),group('B',6,'E06',1,0),group('B',10,'E05',1,0)),
    {...wave(1.8,
      group('A',0,'E01',6,2),
      group('B',0,'E02',5,3),group('B',2,'E01',7,2),group('B',4,'E03',2,5),group('B',8,'E05',2,5),group('B',3,'E06',1,0),group('B',RULES.entryWarning,'E07',1,0),
      group('C',RULES.entryWarning,'E04',2,8)),name:'Boss关'},
  ] satisfies WaveDef[],
};
/** Current and legacy saves share the same legal loadout: one hero and the fixed kit. */
export function createDeck(previous:readonly string[]=[]):string[]{
  const hero=previous.find(id=>LEVEL.loadout.heroes.includes(id))??LEVEL.loadout.heroes[0];
  return [hero,...LEVEL.loadout.fixedCards];
}
const sceneArt = assetManifest.scene;
const designWidth=STAGE_WIDTH,designHeight=STAGE_HEIGHT,backgroundY=0;
export const VIEW = {
  width:designWidth,height:designHeight,backgroundY,
  x0:sceneArt.columnCenters.start/sceneArt.canvas[0]*designWidth,
  x1:sceneArt.columnCenters.end/sceneArt.canvas[0]*designWidth,
  floorY:[792,516,225].map(y=>y/941*designHeight+backgroundY),
  actorHeight:140, heroHeight:170, guardHeight:130, deviceHeight:150, lordHeight:145, background:'B01',
  campDancers:{height:152,offsets:[{x:-245,y:-4},{x:-135,y:0}]},
  gateHeight:210, destroyDuration:.45, windSize:190, statusSize:170, shieldSize:300,effectSize:150,
  platformHeight:40,platformLip:9,topBeamY:25,beamHeight:24,wallLift:70,flagHeight:180,projectileBlend:.22,
  intro:{depth:2000,transition:.55,dialogueAt:.6,danceDuration:1.8,danceOffset:.4,panDistance:.35,bubbleWidth:270,bubbleHeight:145,bubbleGap:24,bubbleOffsetY:55,line:'接着奏乐，接着舞。'},
  effectArt:{hit:'FX-hit',block:'FX-block',rescue:'FX-rescue',heal:'FX-heal',repair:'FX-repair',shield:'FX-shield','shield-break':'FX-shield-break',break:'FX-wood',slam:'FX-dust',hook:'FX-metal',poison:'FX-poison-splash',wind:'FX-wind'} as Record<string,string>,
  maxResolution:2, toastSeconds:2.2, uiInterval:.1,
  input:{dragThreshold:4,longPressMs:320,previewSize:140,fieldTop:94,fieldBottom:735},
  camera:{zoom:1.2,edgeSize:64,edgeSpeed:520,arrivalHold:2,arrivalPan:.55},
  income:{lift:88,arc:70,edge:28},
  ballistaBolt:{width:82,height:15,trail:60},
  boss:{heightScale:1.65,shakeMs:650,shakeIntensity:.012,shockRadius:280},
  colors:{gold:0xe6bb64,green:0x85b393,red:0xe9654e,ink:0x231e19,paper:0xeedcb1},
};
