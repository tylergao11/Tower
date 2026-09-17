import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// Measure the standing figure once, so animation poses keep a stable scale.
const manifest=JSON.parse(readFileSync('assets/game/asset-manifest.json','utf8'));
const metrics={};
for(const id of ['S01','S02','H01','H02','H03']){
  const sprite=manifest.sprites[`${id}/idle`];
  const [left,top,width,height]=sprite.rect;
  const {data}=await sharp(manifest.files[sprite.atlas].path).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let first=height,last=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>32){first=Math.min(first,y);last=Math.max(last,y);}
  if(last<first)throw new Error(`Empty standing frame: ${id}`);
  metrics[id]={bodyRatio:(last-first+1)/height};
}
writeFileSync('src/render/character-metrics.json',JSON.stringify(metrics,null,2)+'\n','utf8');
console.log('Measured friendly standing figures.');
