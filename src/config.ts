import assetManifest from '../assets/game/asset-manifest.json';
import { STAGE_WIDTH, STAGE_HEIGHT } from './viewport';
export type Surface = 'ground' | 'wall' | 'ceiling';
export type CardKind = 'spikes' | 'ballista' | 'poison' | 'income' | 'wind' | 'barricade' | 'hatch' | 'hook' | 'hammer' | 'log' | 'guard' | 'medic';
export type HeroKind = 'guanyu'|'zhangfei'|'zhugeliang';
export const HERO_SKILLS:Record<HeroKind,{name:string;line:string;range:number;damageScale:number;stun:number;push:number;color:number;ink:string}> = {
  guanyu:{name:'青龙偃月',line:'青龙所至，敌阵皆破！',range:1.15,damageScale:1.8,stun:0,push:0,color:0x83ed8c,ink:'#215531'},
  zhangfei:{name:'长坂怒吼',line:'燕人张翼德在此！',range:1.15,damageScale:1.8,stun:.65,push:0,color:0xffae59,ink:'#922c1c'},
  zhugeliang:{name:'借东风',line:'东风已至，破阵！',range:2.8,damageScale:1.8,stun:.35,push:.55,color:0xa6eaff,ink:'#235977'},
};
export interface CardDef {
  id: string; name: string; kind: CardKind; cost: number; hp: number; cooldown: number;
  surfaces: Surface[]; interval: number; range: number; damage: number; tip: string;
  manual?: boolean; mobile?: boolean; speed?: number; income?: number;
  hero?: HeroKind;
}
export interface EnemyDef {
  id: string; name: string; hp: number; speed: number; damage: number; interval: number; reward: number;
  shield?: number; armor?: number; heavy?: boolean; climb?: boolean; engineer?: boolean; ranged?: boolean;
}
export const RULES = {
  step: 1 / 60, maxFrameSeconds: .15, money: 200, lordIncome: 25, lordInterval: 5,
  bagLimit: 2, bagAutoCollect: 10, preparation: 8, intermission: 5, entryWarning: 8,
  movementSpeedScale: .65,
  incomeRateScale: .65,
  captureTime: 1.2, rescueGrace: 1.5, carryMoveSpeed: .32, carryAnimationDuration: 1, refund: .4, buildTime: .6,
  faceWindow: 3, guardLimit: 3, meleeRange: .6, floorTrapAttackRange: .28, captureRange: .4, guardPatrol: 2,
  stairsTime: 1.5, scoutStairsTime: .35, scoutLandTime: .6, controlGrace: .8, heavyControlScale: .5,
  minimumSpeed: .25, windSlow: .4, poisonDps: 6, poisonDuration: 4, hatchOpen: .6,
  hammerWindup: .35, hammerStun: .8, logSpeed: 4, logPush: 1, shieldHp: 250, recallTime: 1,
  engineerRange: 1.5, engineerDamage: 30, engineerGuardDamage: 5, archerRange: 3,
  arrowSpeed: 9, poisonSpeed: 4, hitRadius: .3, dropTime: .42, hitFlash: .16,
  healing: 18, bodyHeight: .42, hangingHeight: 1.45, guardGoalMargin: .65,
  effectsLimit: 100, enemyDeathDuration: .4, attackPoseTime: .35,
  combatReleaseMargin:.18, facingDeadzone:.05, heroSkillInterval:8, heroSkillPoseTime:.7, heroSkillEffectTime:1.6,
} as const;
export const CARDS: CardDef[] = [
  { id:'H01',name:'关羽',kind:'guard',hero:'guanyu',cost:200,hp:420,cooldown:15,surfaces:[],interval:1.15,range:.8,damage:34,mobile:true,speed:.95,tip:'青龙偃月 · 每8秒横扫近敌' },
  { id:'H02',name:'张飞',kind:'guard',hero:'zhangfei',cost:180,hp:520,cooldown:15,surfaces:[],interval:1.3,range:.7,damage:30,mobile:true,speed:.85,tip:'长坂怒吼 · 每8秒震晕近敌' },
  { id:'H03',name:'诸葛亮',kind:'guard',hero:'zhugeliang',cost:180,hp:240,cooldown:15,surfaces:[],interval:1.4,range:2.8,damage:22,mobile:true,speed:.8,tip:'借东风 · 每8秒击退敌军' },
  { id:'G01',name:'地刺',kind:'spikes',cost:60,hp:150,cooldown:3,surfaces:['ground'],interval:2,range:.48,damage:24,tip:'每2秒刺击，群体伤害24' },
  { id:'G02',name:'连弩车',kind:'ballista',cost:120,hp:120,cooldown:5,surfaces:['ground','wall'],interval:1.2,range:3.5,damage:18,tip:'射击地面与攀顶敌军' },
  { id:'G03',name:'悬毒壶',kind:'poison',cost:100,hp:80,cooldown:6,surfaces:['ceiling'],interval:2,range:.35,damage:6,tip:'向下滴毒，持续伤敌' },
  { id:'G04',name:'军需账房',kind:'income',cost:60,hp:80,cooldown:6,surfaces:['ground','wall'],interval:6,range:0,damage:0,income:5,tip:'每约9.23秒产出5军饷' },
  { id:'G05',name:'寒风机关',kind:'wind',cost:90,hp:100,cooldown:5,surfaces:['wall'],interval:0,range:1.2,damage:0,tip:'减缓附近敌军' },
  { id:'G06',name:'拒马',kind:'barricade',cost:80,hp:400,cooldown:8,surfaces:['ground'],interval:0,range:0,damage:0,tip:'阻挡地面敌军' },
  { id:'G07',name:'翻板',kind:'hatch',cost:140,hp:100,cooldown:10,surfaces:['ground'],interval:6,range:.4,damage:0,tip:'把一名敌军送往下层' },
  { id:'G08',name:'破甲钩爪',kind:'hook',cost:130,hp:100,cooldown:8,surfaces:['ceiling'],interval:1.8,range:1.2,damage:16,tip:'剥除盾牌，攻击攀顶敌军' },
  { id:'M01',name:'悬锤',kind:'hammer',cost:150,hp:160,cooldown:10,surfaces:['ceiling'],interval:8,range:.5,damage:110,manual:true,tip:'手动落锤，击晕敌军' },
  { id:'M02',name:'滚木架',kind:'log',cost:180,hp:160,cooldown:15,surfaces:['ground','wall'],interval:12,range:9,damage:90,manual:true,tip:'手动放出滚木，击退敌军' },
  { id:'S01',name:'刀盾亲卫',kind:'guard',cost:100,hp:220,cooldown:8,surfaces:[],interval:.9,range:.6,damage:16,mobile:true,speed:.9,tip:'迎敌并拦截一名地面敌军' },
  { id:'S02',name:'军医匠',kind:'medic',cost:120,hp:140,cooldown:10,surfaces:[],interval:1.5,range:2,damage:0,mobile:true,speed:.8,tip:'治疗守军，维修机关' },
];
export const CARD = Object.fromEntries(CARDS.map(c => [c.id,c])) as Record<string,CardDef>;
export const ENEMIES: EnemyDef[] = [
  { id:'E01',name:'曹军步卒',hp:130,speed:.65,damage:10,interval:1,reward:5 },
  { id:'E02',name:'盾兵',hp:195,speed:.5,damage:14,interval:1.2,reward:8,shield:100 },
  { id:'E03',name:'破械工兵',hp:130,speed:.6,damage:5,interval:1,reward:8,engineer:true },
  { id:'E04',name:'飞檐斥候',hp:117,speed:1,damage:14,interval:1,reward:8,climb:true },
  { id:'E05',name:'敌军弓手',hp:156,speed:.55,damage:14,interval:1.6,reward:8,ranged:true },
  { id:'E06',name:'重甲虎卫',hp:585,speed:.38,damage:35,interval:1.5,reward:20,armor:.25,heavy:true },
  { id:'E07',name:'曹洪',hp:1170,speed:.4,damage:45,interval:1.5,reward:40,armor:.25,heavy:true },
];
export const ENEMY = Object.fromEntries(ENEMIES.map(e => [e.id,e])) as Record<string,EnemyDef>;
export interface SpawnGroup { entry:'A'|'B'|'C'; at:number; enemy:string; count:number; gap:number }
const group=(entry:SpawnGroup['entry'],at:number,enemy:string,count:number,gap:number):SpawnGroup=>({entry,at,enemy,count,gap});
export const LEVEL = {
  id:'xinye', name:'新野', columns:10, floors:3, floorHeight:2,
  defaultDeck:['H01','H02','H03','G04','G01','G02','G06','G08'], requiredCards:['G04'], deckSize:8,
  lord:{floor:2,x:6.3},
  entries:{ A:{floor:0,x:0,wave:1,name:'城外'}, B:{floor:1,x:9,wave:3,name:'城门'}, C:{floor:2,x:0,wave:5,name:'营地'} },
  waves:[
    [group('A',0,'E01',8,3)],
    [group('A',0,'E01',8,2.5),group('A',8,'E02',3,6)],
    [group('A',0,'E01',5,3),group('B',8,'E01',6,2.5),group('B',22,'E03',3,5)],
    [group('A',0,'E01',6,2),group('B',8,'E02',5,2.5),group('B',13,'E05',3,3)],
    [group('A',0,'E01',5,2.5),group('B',8,'E03',4,3),group('C',8,'E02',2,3),group('C',11,'E01',3,2.5),group('C',20,'E04',3,3)],
    [group('A',0,'E02',4,3),group('B',6,'E05',4,2.5),group('C',12,'E04',5,3),group('A',12,'E06',3,5)],
    [group('A',0,'E06',4,3),group('B',4,'E03',5,2),group('C',8,'E02',4,2),group('C',18,'E04',5,2),group('B',20,'E05',4,2.5)],
    [group('A',0,'E06',5,3.5),group('B',8,'E03',4,2.5),group('C',16,'E02',5,2),group('C',24,'E07',1,0),group('C',27,'E04',5,2),group('B',26,'E05',3,2.5)],
  ] satisfies SpawnGroup[][],
};
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
  input:{dragThreshold:4,longPressMs:320,previewSize:140,bagPadding:24,fieldTop:94,fieldBottom:735},
  camera:{zoom:1.2,edgeSize:64,edgeSpeed:520,arrivalHold:2,arrivalPan:.55},
  bag:{width:76,height:76,lift:88,bob:5,bobSpeed:3},
  colors:{gold:0xe6bb64,green:0x85b393,red:0xe9654e,ink:0x231e19,paper:0xeedcb1},
};
