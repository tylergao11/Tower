import { LEVEL, RULES } from '../config';
export interface Position { x:number; floor:number; elevation:number; stairs:boolean }
export const lastColumn=LEVEL.columns-1;
export const stride=LEVEL.columns;
export const destination=(LEVEL.floors-1)*stride+lastColumn;
export function routeAt(floor:number,x:number):number { return floor*stride+(floor%2 ? lastColumn-x:x); }
export function entryOpen(entry:typeof LEVEL.entries[keyof typeof LEVEL.entries],wave:number,waveTime:number):boolean {
  return wave>entry.wave||(wave===entry.wave&&(entry.wave===1||waveTime>=RULES.entryWarning));
}
export function nearestExit(q:number,wave:number,waveTime:number):keyof typeof LEVEL.entries {
  return (Object.keys(LEVEL.entries) as (keyof typeof LEVEL.entries)[])
    .filter(key=>entryOpen(LEVEL.entries[key],wave,waveTime))
    .sort((a,b)=>Math.abs(routeAt(LEVEL.entries[a].floor,LEVEL.entries[a].x)-q)-Math.abs(routeAt(LEVEL.entries[b].floor,LEVEL.entries[b].x)-q))[0]!;
}
export function position(q:number):Position {
  q=Math.max(0,Math.min(destination,q));
  const floor=Math.min(LEVEL.floors-1,Math.floor(q/stride));
  const part=q-floor*stride;
  const stairs=part>lastColumn;
  return { floor,x:floor%2 ? Math.max(0,lastColumn-part):Math.min(lastColumn,part), elevation:floor+(stairs?part-lastColumn:0),stairs };
}
export function groundPosition(q:number) { const p=position(q);return {floor:p.floor,x:p.x}; }
export function routeFacing(q:number,direction:number) {
  const p=position(q+Math.sign(direction)*Number.EPSILON*stride);
  return (p.floor%2?-1:1)*(p.stairs?-1:1)*(Math.sign(direction)||1);
}
export function worldY(p:Position,hanging=false) { return p.elevation*LEVEL.floorHeight+(hanging?RULES.hangingHeight:RULES.bodyHeight); }
export function distance(a:{x:number;floor:number},b:{x:number;floor:number}) { return Math.hypot(a.x-b.x,(a.floor-b.floor)*LEVEL.floorHeight); }
