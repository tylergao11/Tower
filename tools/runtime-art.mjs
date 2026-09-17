import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

/** Build the shipped manifest from live objects and lossless authoring inputs. */
export async function finalizeRuntimeArt(m,root){
  const output=path.join(root,'assets/game');
  await fs.mkdir(path.join(output,'atlases'),{recursive:true});
  const writeTexture=async(id,relative,pipeline,source)=>{
    const {data,info}=await pipeline.toBuffer({resolveWithObject:true});
    const destination=path.join(root,relative);
    let unchanged=false;
    try{unchanged=(await fs.readFile(destination)).equals(data);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!unchanged){
      const temporary=destination+'.'+crypto.randomUUID()+'.tmp';
      try{await fs.writeFile(temporary,data);await fs.rename(temporary,destination);}
      finally{await fs.rm(temporary,{force:true});}
    }
    m.files[id]={path:relative,width:info.width,height:info.height,bytes:data.length,sha256:hash(data),hasAlpha:info.channels===4,source};
    return info;
  };
  for(const [id,relative,source,width,height] of [
    ['B01','assets/game/shu-camp-integrated.webp','art/source/map-redraw/shu-camp-style-v2.png',1672,941],
    ['B05-BACKDROP','assets/game/liubei-leisure-backdrop-v1.webp',m.files['B05-BACKDROP'].source,1280,720],
  ]){
    const info=await writeTexture(id,relative,sharp(path.join(root,source)).resize({width,height,fit:'inside',withoutEnlargement:true}).webp({quality:84,effort:6,smartSubsample:true}),source);
    m.sprites[id]={atlas:id,rect:[0,0,info.width,info.height],sourceSize:[1672,941]};
  }
  // These static decorations are already painted into the accepted integrated map.
  for(const id of ['B05-curtain','B-flag-red','B-flag-green','B-flag-blue']){delete m.objects[id];delete m.bindings[id];}
  m.scene={...m.scene,background:'B01',integrated:true,laneBaselines:[792,516,225]};
  for(const key of ['floorModule','floorFront','beam','post'])delete m.scene[key];
  // The painted stairs still need route coordinates, but no separate textures.
  m.scene.stairs={bottomToMiddle:{rect:[1512,516,160,276]},middleToTop:{rect:[0,225,174,291]}};

  const live=new Set(['B01','B05-BACKDROP','UI-ICONS/play','UI-ICONS/warning','UI-ICONS/grab','UI-ICONS/rescue','MX-A/G04-bag','MX-B/M02-log','FX/arrow','FX/poison-drop']);
  const walk=value=>{
    if(typeof value==='string'){if(m.sprites[value])live.add(value);return;}
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(m.sprites[key])live.add(key);walk(item);}
  };
  walk(m.objects);walk(m.bindings);
  // Preserve every supplied character pose, including the artist's library poses.
  const characterAtlases=new Set(Object.values(m.objects).filter(o=>o.kind==='character').flatMap(o=>Object.values(o.nodes).map(n=>m.sprites[n.sprite]?.atlas)));
  for(const [id,sprite] of Object.entries(m.sprites))if(characterAtlases.has(sprite.atlas))live.add(id);

  const pieces=new Map();
  for(const id of live){
    const s=m.sprites[id];if(!s)throw new Error('Missing runtime sprite: '+id);
    if(characterAtlases.has(s.atlas)||['B01','B05-BACKDROP'].includes(s.atlas))continue;
    const file=m.files[s.atlas],source=s.sourcePng??file.path;
    const key=source+(s.sourcePng?'':':'+s.rect.join(','));
    let piece=pieces.get(key);
    if(!piece){
      let pipeline=sharp(path.join(root,source));
      if(!s.sourcePng){const [left,top,width,height]=s.rect;pipeline=pipeline.extract({left,top,width,height});}
      const edge=s.atlas.startsWith('REDRAW-effects')?192:s.atlas.startsWith('REDRAW-')?256:Math.max(s.rect[2],s.rect[3]);
      const {data,info}=await pipeline.resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).ensureAlpha().png().toBuffer({resolveWithObject:true});
      piece={data,width:info.width,height:info.height,ids:[]};pieces.set(key,piece);
    }
    piece.ids.push(id);
  }
  const gutter=2,edge=1024,pages=[];
  let page;
  const newPage=()=>{page={pieces:[],x:gutter,y:gutter,rowHeight:0};pages.push(page);};
  newPage();
  for(const piece of [...pieces.values()].sort((a,b)=>b.height-a.height||b.width-a.width)){
    if(page.x+piece.width+gutter>edge){page.x=gutter;page.y+=page.rowHeight+gutter*2;page.rowHeight=0;}
    if(page.y+piece.height+gutter>edge)newPage();
    piece.x=page.x;piece.y=page.y;page.pieces.push(piece);
    page.x+=piece.width+gutter*2;page.rowHeight=Math.max(page.rowHeight,piece.height);
  }
  for(const [index,page] of pages.entries()){
    const id='WORLD-'+index,height=Math.ceil((page.y+page.rowHeight+gutter)/4)*4;
    const layers=await Promise.all(page.pieces.map(async p=>({input:await sharp(p.data).extend({top:gutter,bottom:gutter,left:gutter,right:gutter,extendWith:'copy'}).png().toBuffer(),left:p.x-gutter,top:p.y-gutter})));
    await writeTexture(id,`assets/game/atlases/world-${index}.webp`,sharp({create:{width:edge,height,channels:4,background:'#00000000'}}).composite(layers).webp({quality:84,alphaQuality:100,effort:6,smartSubsample:true}),'lossless source crops; 2px extruded gutters');
    for(const p of page.pieces)for(const spriteId of p.ids)m.sprites[spriteId]={...m.sprites[spriteId],atlas:id,rect:[p.x,p.y,p.width,p.height]};
  }
  m.sprites=Object.fromEntries(Object.entries(m.sprites).filter(([id])=>live.has(id)));
  const usedFiles=new Set(Object.values(m.sprites).map(s=>s.atlas));
  m.files=Object.fromEntries(Object.entries(m.files).filter(([id])=>usedFiles.has(id)));
  const atlasesFor=ids=>[...new Set(ids.flatMap(id=>{
    const found=new Set();
    const scan=value=>{
      if(typeof value==='string'&&m.sprites[value])found.add(m.sprites[value].atlas);
      else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(m.sprites[key])found.add(m.sprites[key].atlas);scan(item);}
    };
    scan(m.objects[id]);return [...found];
  }))];
  m.loadingGroups={intro:['B05-BACKDROP',...atlasesFor(['L01','B05-dancer'])],battle:['B01',...pages.map((_,i)=>'WORLD-'+i),...atlasesFor(['L01'])],enemies:atlasesFor(['E01','E02','E03','E04','E05','E06','E07']),defenders:atlasesFor(['S01','S02'])};
  delete m.sources;
  m.statistics={generatedWebpBytes:Object.values(m.files).reduce((n,f)=>n+f.bytes,0),decodedTextureBytesIfAllLoaded:Object.values(m.files).reduce((n,f)=>n+f.width*f.height*4,0),textures:Object.keys(m.files).length,transparentParts:Object.keys(m.sprites).length,wholeBodyCharacters:Object.values(m.objects).filter(o=>o.kind==='character').length};
  console.log('手机运行图集：'+pages.length+' 张；资源清单 '+Object.keys(m.files).length+' 张纹理');
}
