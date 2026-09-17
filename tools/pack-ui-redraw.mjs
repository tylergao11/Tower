import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'art/source/ui-redraw/kit.png');
const output=path.join(root,'assets/game/ui-redraw');
await fs.mkdir(output,{recursive:true});
const cuts={logo:[0,100,548,315],plaque:[549,165,460,220],button:[1032,165,496,220],banner:[78,432,373,506],shield:[540,435,470,497]};
for(const [name,[left,top,width,height]] of Object.entries(cuts)){
  const cropped=await sharp(source).extract({left,top,width,height}).png().toBuffer();
  const edge={logo:512,plaque:448,button:320,banner:192,shield:224}[name];
  const trimmed=await sharp(cropped).trim({threshold:10}).png().toBuffer();
  await sharp(trimmed).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality:86,alphaQuality:100,effort:6,smartSubsample:true}).toFile(path.join(output,name+'.webp'));
}
console.log('UI 素材已导出：'+Object.keys(cuts).join('、'));
