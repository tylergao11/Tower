import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),assetRoot=path.join(root,'assets/game');
const manifest=JSON.parse(await fs.readFile(path.join(assetRoot,'asset-manifest.json'),'utf8'));
const records=JSON.parse(await fs.readFile(path.join(root,'art/generation-records.json'),'utf8'));
const live=new Set(Object.values(manifest.files).map(f=>path.resolve(root,f.path)));
for(const directory of ['src','preview'])for(const name of await fs.readdir(path.join(root,directory),{recursive:true})){
  if(!/\.(?:ts|js|css|html)$/.test(name))continue;
  const content=await fs.readFile(path.join(root,directory,name),'utf8');
  for(const match of content.matchAll(/assets\/game\/[^\s'"()?*{}\[\]]+\.(?:webp|png)/g))live.add(path.resolve(root,match[0]));
}
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/assets\/game\/[^\s'"()?*{}\[\]]+\.(?:webp|png)/g))live.add(path.resolve(root,match[0]));
// Refuse cleanup if a formal dependency is missing. Never guess that a missing asset is unused.
for(const file of live){if(!file.startsWith(assetRoot+path.sep))throw new Error('Unexpected asset path: '+file);await fs.access(file);}
const legacyNames=new Set([...records.jobs.map(j=>j.name+'.webp'),...['camp-city-outskirts-v1','mechanism-states-v1','actors-v2','cao-troops-v3','effects-v1','shu-infantry-v1','liubei-poses-v1','cao-commanders-v1','shu-devices-v3','props','camp-back-v1','camp-card-v1','camp-coin-v1','camp-gold-v1','camp-ivory-v1','camp-paper-v1','camp-dancer-frames-v1','gate-door-left-v1','gate-door-right-v1','liubei-legs-v2','liubei-leisure-parts-v1'].map(n=>n+'.webp'),'actors-rigs.json']);
const candidates=[];
for(const relative of await fs.readdir(assetRoot,{recursive:true})){
  const normalized=relative.replaceAll('\\','/');
  if(legacyNames.has(normalized)||/^[^/]+-(?:whole|parts)-v1\.webp$/.test(normalized)||/^noncharacter-redraw\/(mechanisms|parts|effects)\/[^/]+\.webp$/.test(normalized)||/^atlases\/world-\d+\.webp$/.test(normalized))candidates.push(path.resolve(assetRoot,relative));
}
const removed=[];
for(const file of candidates){
  if(!file.startsWith(assetRoot+path.sep))throw new Error('Cleanup outside runtime directory: '+file);
  if(live.has(file))continue;
  const stat=await fs.stat(file);if(!stat.isFile())continue;
  await fs.unlink(file);removed.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:stat.size});
}
// Only these two explicitly superseded map drafts; retain accepted lossless masters.
for(const relative of ['art/source/map-redraw/shu-camp.png','art/source/map-redraw/shu-camp-green-flags.png']){
  const file=path.resolve(root,relative);
  if(!file.startsWith(path.join(root,'art/source/map-redraw')+path.sep))throw new Error('Invalid draft path');
  try{const stat=await fs.stat(file);await fs.unlink(file);removed.push({path:relative,bytes:stat.size});}catch(error){if(error.code!=='ENOENT')throw error;}
}
const reportPath=path.join(root,'art/reports/mobile-assets-removed.json');
let previous=[];try{previous=JSON.parse(await fs.readFile(reportPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(path.dirname(reportPath),{recursive:true});
await fs.writeFile(reportPath,JSON.stringify([...previous,...removed],null,2)+'\n','utf8');
console.log('已删除确认废弃的素材 '+removed.length+' 个，共 '+(removed.reduce((sum,f)=>sum+f.bytes,0)/1048576).toFixed(2)+' MiB；正式依赖已保留。');
