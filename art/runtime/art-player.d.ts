export interface ArtNode {
  sprite?:string; x:number; y:number; width:number; height:number; z:number; pivot:[number,number];
  rotation?:number; scaleX?:number; scaleY?:number; alpha?:number; parent?:string; socket?:string;
}
export interface ArtKey extends Partial<ArtNode> { t:number; hold?:boolean }
export interface ArtClip { loop?:boolean; duration?:number; tracks:Record<string,ArtKey[]>; events?:Array<{t:number;event:string;attachment?:string}> }
export interface ArtObject {
  id:string; name:string; kind:string; canvas:[number,number]; anchor:[number,number]; nodes:Record<string,ArtNode>;
  shieldSlots?:string[]; attachments?:Record<string,{x?:number;y?:number;parent?:string;socket?:string}>; clips:Record<string,ArtClip>;
  constraints?:Array<{node:string;socket:string;target:string;targetSocket?:string;x?:number;y?:number;visibleWith?:string}>;
  variants?:Record<string,Record<string,string>>;
}
export interface ArtPose {
  layers:Array<ArtNode & {slot:string;sprite:string;matrix:[number,number,number,number,number,number];chain:ArtNode[];alpha:number}>;
  attachments:Record<string,[number,number]>; anchor:[number,number]; events:NonNullable<ArtClip['events']>; loop:boolean;
}
export function sampleArt(manifest:{objects:Record<string,ArtObject>;sprites:Record<string,{joints?:Record<string,[number,number]>}>},id:string,action:string,phase:number,options?:{hiddenSlots?:string[];variant?:string}):ArtPose;
export function artPhase(clip:ArtClip,elapsed:number,duration?:number,offset?:number):number;
export function crossedArtEvents(clip:ArtClip,previousPhase:number,phase:number):NonNullable<ArtClip['events']>;
