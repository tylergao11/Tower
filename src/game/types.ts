import type { CardDef, EnemyDef } from '../config';
export type Phase='select'|'prepare'|'wave'|'rest'|'won'|'lost';
export type Action='idle'|'walk'|'attack'|'hit'|'grab'|'carry'|'climb'|'fall'|'dead'|'heal'|'open'|'struggle'|'cheer';
export interface Drop { fromFloor:number; toFloor:number; elapsed:number }
export interface Enemy {
  uid:number; def:EnemyDef; q:number; hp:number; shield:number; face:number;
  hanging:boolean; landing:number; action:Action; actionUntil:number; attackCd:number; grab:number;
  stun:number; controlGrace:number; poison:number; slow:number; hit:number; deadAt?:number;
  lastAttacker?:number; drop?:Drop; blockedBy?:number;
}
export interface Unit {
  uid:number; def:CardDef; floor:number; x:number; home:number; hp:number; facing:number;
  born:number; ready:number; cooldown:number; production:number; hit:number; action:Action; actionUntil:number;
  pending:number; openUntil:number; blockedEnemy?:number;
}
export interface Lord {
  state:'idle'|'grabbing'|'carried'|'dropped'|'returning'|'lost'; floor:number; x:number;
  carrier?:number; grabber?:number; grace:number; shield:number; production:number; returning:number;
}
export interface Projectile {
  uid:number; kind:'arrow'|'poison'|'log'; team:'friendly'|'enemy'; x:number;y:number;vx:number;vy:number;
  startX:number;startY:number;born:number;
  damage:number; source:number; floor:number; life:number; hitIds:Set<number>;
}
export interface Bag { uid:number; source:number;floor:number;x:number;amount:number }
export interface Effect { uid:number;kind:string;floor:number;x:number;life:number;maxLife:number;value?:number }
export interface BattleStats { captures:number;rescues:number;losses:number;kills:number;time:number }
export type Command =
  | {type:'deploy';card:string;floor:number;x:number;facing?:number}
  | {type:'sell'|'activate'|'turn';uid:number}
  | {type:'rally';uid:number;x:number}
  | {type:'focus';uid:number}
  | {type:'collect';uid:number}
  | {type:'shield'|'recall'};
export interface Spawn { entry:'A'|'B'|'C'; at:number; enemy:string }
