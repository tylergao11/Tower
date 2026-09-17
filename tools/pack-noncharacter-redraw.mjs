import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..');
const jobs=[
  {name:'mechanisms',grid:[5,2],cells:['G01','G02','G03','G04','G05','G06','G07','G08','M01','M02']},
  {name:'ui',grid:[4,2],cells:['panel','tray','card','speech','nameplate','pause','sound','coin']},
  {name:'effects',grid:[4,4],cells:['arrow','poison-drop','poison-splash','wind','hit','block','dust','wood','metal','heal','repair','bag','rescue','shield','shield-break','return-trail']},
  {name:'parts',grid:[4,4],cells:['G01-base','G01-spikes','G02-chassis','G02-bow','G03-mount','G03-jar','G05-housing','G05-fan','G07-frame','G07-panel','G08-mount','G08-claw','M01-mount','M01-hammer','M02-cradle','M02-log']},
];
const manifest={description:'本轮新绘制的非人物美术。独立资源裁切，不改人物资源与现有动作清单。',groups:{}};
for(const job of jobs){
  const source=path.join(root,'art/source/noncharacter-redraw',job.name+'.png');
  try{await fs.access(source);}catch{continue;}
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=info,labels=new Int32Array(width*height),queue=new Int32Array(width*height),components=[null];
  const groups=job.cells.map(()=>({left:width,top:height,right:-1,bottom:-1}));
  for(let seed=0;seed<labels.length;seed++){
    if(labels[seed]||data[seed*4+3]<=8)continue;
    const id=components.length;let head=0,tail=1,sx=0,sy=0;
    queue[0]=seed;labels[seed]=id;
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width);sx+=x;sy+=y;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy,np=ny*width+nx;
        if(nx>=0&&nx<width&&ny>=0&&ny<height&&!labels[np]&&data[np*4+3]>8){labels[np]=id;queue[tail++]=np;}
      }
    }
    const col=Math.min(job.grid[0]-1,Math.floor(sx/tail/width*job.grid[0]));
    const row=Math.min(job.grid[1]-1,Math.floor(sy/tail/height*job.grid[1]));
    components.push({group:row*job.grid[0]+col,count:tail});
  }
  for(let p=0;p<labels.length;p++){
    const component=components[labels[p]];if(!component||component.count<5)continue;
    const g=groups[component.group],x=p%width,y=Math.floor(p/width);
    g.left=Math.min(g.left,x);g.right=Math.max(g.right,x);g.top=Math.min(g.top,y);g.bottom=Math.max(g.bottom,y);
  }
  // Lossless intermediates stay outside the shipped directory; the runtime uses atlases.
  const output=path.join(root,job.name==='ui'?'assets/game/noncharacter-redraw':'art/packed/noncharacter-redraw',job.name);await fs.mkdir(output,{recursive:true});
  const entries={};
  for(let i=0;i<job.cells.length;i++){
    const g=groups[i];if(g.right<0)throw new Error('缺少图件：'+job.name+'/'+job.cells[i]);
    const left=Math.max(0,g.left-2),top=Math.max(0,g.top-2),w=Math.min(width,g.right+3)-left,h=Math.min(height,g.bottom+3)-top;
    const pixels=Buffer.alloc(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const p=(top+y)*width+left+x,c=components[labels[p]];
      if(c?.group===i&&c.count>=5)data.copy(pixels,(y*w+x)*4,p*4,p*4+4);
    }
    const name=job.cells[i],isUI=job.name==='ui',target=path.join(output,name+(isUI?'.webp':'.png'));
    let pipeline=sharp(pixels,{raw:{width:w,height:h,channels:4}});
    if(isUI){
      const edge={panel:1024,tray:1024,card:320,speech:512,nameplate:320,pause:144,sound:144,coin:80}[name];
      pipeline=pipeline.resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality:86,alphaQuality:100,effort:6,smartSubsample:true});
    }else pipeline=pipeline.png();
    const info=await pipeline.toFile(target);
    entries[name]={path:path.relative(root,target).replaceAll('\\','/'),sourceRect:[left,top,w,h],width:info.width,height:info.height};
  }
  manifest.groups[job.name]={source:path.relative(root,source).replaceAll('\\','/'),grid:job.grid,entries};
  console.log(job.name+'：'+job.cells.length+' 张已导出');
}
await fs.writeFile(path.join(root,'art/noncharacter-redraw-assets.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
