import { LEVEL, VIEW } from '../config';
import { lastColumn, position } from '../game/map';
import { manifest } from './art';

export function floorPoint(floor:number,x:number) {
  return {x:VIEW.x0+x*(VIEW.x1-VIEW.x0)/lastColumn,y:VIEW.floorY[Math.max(0,Math.min(LEVEL.floors-1,floor))]};
}
export function ceilingY(floor:number) {
  return floor<LEVEL.floors-1?VIEW.floorY[floor+1]+VIEW.platformHeight:VIEW.topBeamY+VIEW.beamHeight;
}
function stairEnd(lower:number,upper:boolean) {
  const stairs=lower===0?manifest.scene.stairs.bottomToMiddle:manifest.scene.stairs.middleToTop;
  const [x,y,w,h]=stairs.rect;
  const u=lower%2===0?(upper?.12:.88):(upper?.88:.12);
  return {x:(x+w*u)/manifest.scene.canvas[0]*VIEW.width,y:VIEW.floorY[lower+(upper?1:0)]};
}
function routeFloorPoint(floor:number,x:number) {
  let p=floorPoint(floor,x);
  if(x>lastColumn-1&&floor<LEVEL.floors-1){
    const edge=stairEnd(0,floor===1),near=floorPoint(floor,lastColumn-1),t=x-(lastColumn-1);
    p={x:near.x+(edge.x-near.x)*t,y:p.y};
  }else if(x<1&&floor>0){
    const edge=stairEnd(1,floor===2),near=floorPoint(floor,1);
    p={x:edge.x+(near.x-edge.x)*x,y:p.y};
  }
  return p;
}
export function routePoint(q:number) {
  const p=position(q);if(!p.stairs)return routeFloorPoint(p.floor,p.x);
  const from=stairEnd(p.floor,false),to=stairEnd(p.floor,true),t=p.elevation-p.floor;
  return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
}
export function worldPoint(x:number,y:number) {
  const floor=Math.max(0,Math.min(LEVEL.floors-1,Math.floor(y/LEVEL.floorHeight))),p=floorPoint(floor,x);
  const height=floor<LEVEL.floors-1?VIEW.floorY[floor]-VIEW.floorY[floor+1]:VIEW.floorY[0]-VIEW.floorY[1];
  p.y-=(y-floor*LEVEL.floorHeight)/LEVEL.floorHeight*height;return p;
}
