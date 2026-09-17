import assetManifest from '../assets/game/asset-manifest.json';
export type Surface = 'ground' | 'wall' | 'ceiling';
export type CardKind = 'spikes' | 'ballista' | 'poison' | 'income' | 'wind' | 'barricade' | 'hatch' | 'hook' | 'hammer' | 'log' | 'guard' | 'medic';
export interface CardDef {
  id: string; name: string; kind: CardKind; cost: number; hp: number; cooldown: number;
  surfaces: Surface[]; interval: number; range: number; damage: number; tip: string;
  manual?: boolean; mobile?: boolean; speed?: number; income?: number;
}
export interface EnemyDef {
  id: string; name: string; hp: number; speed: number; damage: number; interval: number; reward: number;
  shield?: number; armor?: number; heavy?: boolean; climb?: boolean; engineer?: boolean; ranged?: boolean;
}
export const RULES = {
  step: 1 / 60, maxFrameSeconds: .15, money: 200, moneyCap: 999, lordIncome: 25, lordInterval: 5,
  bagLimit: 2, preparation: 8, intermission: 5, entryWarning: 8,
  captureTime: 1.2, rescueGrace: 1.5, carrySpeed: .75, refund: .4, buildTime: .6,
  faceWindow: 3, guardLimit: 3, meleeRange: .6, captureRange: .4, guardPatrol: 2,
  stairsTime: 1.5, scoutStairsTime: .35, scoutLandTime: .6, controlGrace: .8, heavyControlScale: .5,
  minimumSpeed: .25, windSlow: .4, poisonDps: 6, poisonDuration: 4, hatchOpen: .6,
  hammerWindup: .35, hammerStun: .8, logSpeed: 4, logPush: 1, shieldHp: 250, recallTime: 1,
  engineerRange: 1.5, engineerDamage: 30, engineerGuardDamage: 5, archerRange: 3,
  arrowSpeed: 9, poisonSpeed: 4, hitRadius: .3, dropTime: .42, hitFlash: .16,
  healing: 18, bodyHeight: .42, hangingHeight: 1.45, guardGoalMargin: .65,
  effectsLimit: 100, enemyDeathDuration: .4, attackPoseTime: .35,
} as const;
export const CARDS: CardDef[] = [
  { id:'G01',name:'地刺',kind:'spikes',cost:60,hp:150,cooldown:3,surfaces:['ground'],interval:2,range:.48,damage:24,tip:'刺伤脚下敌军' },
  { id:'G02',name:'连弩车',kind:'ballista',cost:120,hp:120,cooldown:5,surfaces:['ground','wall'],interval:1.2,range:3.5,damage:18,tip:'射击地面与攀顶敌军' },
  { id:'G03',name:'悬毒壶',kind:'poison',cost:100,hp:80,cooldown:6,surfaces:['ceiling'],interval:2,range:.35,damage:6,tip:'向下滴毒，持续伤敌' },
  { id:'G04',name:'军需账房',kind:'income',cost:60,hp:80,cooldown:6,surfaces:['ground','wall'],interval:6,range:0,damage:0,income:15,tip:'每六秒产出十五军饷' },
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
  { id:'E01',name:'曹军步卒',hp:100,speed:.65,damage:10,interval:1,reward:5 },
  { id:'E02',name:'盾兵',hp:150,speed:.5,damage:14,interval:1.2,reward:8,shield:100 },
  { id:'E03',name:'破械工兵',hp:100,speed:.6,damage:5,interval:1,reward:8,engineer:true },
  { id:'E04',name:'飞檐斥候',hp:90,speed:1,damage:14,interval:1,reward:8,climb:true },
  { id:'E05',name:'敌军弓手',hp:120,speed:.55,damage:14,interval:1.6,reward:8,ranged:true },
  { id:'E06',name:'重甲虎卫',hp:450,speed:.38,damage:35,interval:1.5,reward:20,armor:.25,heavy:true },
  { id:'E07',name:'曹洪',hp:900,speed:.4,damage:45,interval:1.5,reward:40,armor:.25,heavy:true },
];
export const ENEMY = Object.fromEntries(ENEMIES.map(e => [e.id,e])) as Record<string,EnemyDef>;
export interface SpawnGroup { entry:'A'|'B'|'C'; at:number; enemy:string; count:number; gap:number }
const group=(entry:SpawnGroup['entry'],at:number,enemy:string,count:number,gap:number):SpawnGroup=>({entry,at,enemy,count,gap});
export const LEVEL = {
  id:'xinye', name:'新野', columns:10, floors:3, floorHeight:2,
  defaultDeck:['G01','G02','G04','G05','G06','G07','M01','S01'], deckSize:8,
  lord:{floor:2,x:9},
  entries:{ A:{floor:0,x:0,wave:1,name:'城外'}, B:{floor:1,x:9,wave:3,name:'城门'}, C:{floor:2,x:0,wave:5,name:'营地'} },
  waves:[
    [group('A',0,'E01',6,3)],
    [group('A',0,'E01',6,2.5),group('A',8,'E02',2,6)],
    [group('A',0,'E01',4,3),group('B',8,'E01',5,2.5),group('B',22,'E03',2,5)],
    [group('A',0,'E01',6,2),group('B',8,'E02',3,4),group('B',20,'E05',2,5)],
    [group('A',0,'E01',4,2.5),group('B',8,'E03',3,5),group('C',8,'E01',4,3),group('C',22,'E04',2,6)],
    [group('A',0,'E02',3,4),group('B',6,'E05',3,4),group('C',12,'E04',4,5),group('A',18,'E06',2,8)],
    [group('A',0,'E01',5,2),group('B',4,'E03',4,4),group('C',8,'E02',3,4),group('C',20,'E04',3,4),group('B',25,'E05',2,4)],
    [group('A',0,'E06',2,8),group('B',4,'E02',4,4),group('C',8,'E04',3,5),group('B',12,'E03',2,6),group('C',24,'E07',1,0),group('A',26,'E01',6,2)],
  ] satisfies SpawnGroup[][],
};
const sceneArt = assetManifest.scene;
const designWidth=1600,designHeight=900,backgroundY=-30;
export const VIEW = {
  width:designWidth,height:designHeight,backgroundY,
  x0:sceneArt.columnCenters.start/sceneArt.canvas[0]*designWidth,
  x1:sceneArt.columnCenters.end/sceneArt.canvas[0]*designWidth,
  floorY:sceneArt.laneBaselines.map(y=>y/sceneArt.canvas[1]*designHeight+backgroundY),
  actorHeight:140, deviceHeight:150, lordHeight:145, background:'B01',
  gateHeight:210, destroyDuration:.45, windSize:190, statusSize:170, shieldSize:300,effectSize:150,
  platformHeight:40,platformLip:9,topBeamY:90,beamHeight:24,wallLift:70,flagHeight:180,projectileBlend:.22,
  intro:{depth:2000,hold:5.8,transition:1.2,dialogueAt:.6,skipAt:2.5,danceDuration:1.8,danceOffset:.4,panDistance:.35,bubbleWidth:440,bubbleGap:142,line:'接着奏乐，接着舞。'},
  effectArt:{hit:'FX-hit',block:'FX-block',rescue:'FX-rescue',heal:'FX-heal',repair:'FX-repair',shield:'FX-shield','shield-break':'FX-shield-break',break:'FX-wood',slam:'FX-dust',hook:'FX-metal',poison:'FX-poison-splash'} as Record<string,string>,
  maxResolution:2, toastSeconds:2.2, uiInterval:.1,
  input:{dragThreshold:8,previewSize:140,bagPadding:24,fieldTop:74,fieldBottom:755},
  bag:{width:36,height:40,lift:50,bob:4,bobSpeed:4},
  colors:{gold:0xe6bb64,green:0x85b393,red:0xe9654e,ink:0x231e19,paper:0xeedcb1},
};
