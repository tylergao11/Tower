import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = path.resolve(import.meta.dirname, '..');
const records = JSON.parse(await fs.readFile(path.join(root, 'art/generation-records.json'), 'utf8'));
const packing = JSON.parse(await fs.readFile(path.join(root, 'art/packing-settings.json'), 'utf8'));
const outDir = path.join(root, 'art/packed/legacy');
await fs.mkdir(outDir, { recursive: true });
const result = { version: 2, description: '唯一美术资源映射。所有坐标为像素；动作采用归一化时间，实际时长由游戏规则传入。', files: {}, sprites: {}, sources: {}, statistics: {} };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let sourceBytes = 0, textureBytes = 0;
for (const job of records.jobs) {
  const source = await fs.readFile(path.join(root, job.source));
  const meta = await sharp(source).metadata();
  sourceBytes += source.length;
  if (job.kind === 'plate') {
    const dest = `art/packed/legacy/${job.name}.webp`;
    const {data,info: scaled} = await sharp(source).resize({width:packing.background.maxWidth,height:packing.background.maxHeight,fit:'inside',withoutEnlargement:true}).webp({ quality: packing.background.quality, alphaQuality: 100, effort: 6 }).toBuffer({resolveWithObject:true});
    await fs.writeFile(path.join(root, dest), data);
    result.files[job.id] = { path: dest, width: scaled.width, height: scaled.height, bytes: data.length, sha256: sha(data), hasAlpha: meta.hasAlpha, source: job.source };
    result.sprites[job.id] = { atlas: job.id, rect: [0, 0, scaled.width, scaled.height], sourceSize: [meta.width, meta.height] };
    textureBytes += scaled.width * scaled.height * 4;
    continue;
  }
  if (!meta.hasAlpha) throw new Error(`${job.id}: 生成图没有透明通道，不可冒充透明素材。`);
  const [cols, rows] = job.grid;
  const settings={...packing.default,...packing.overrides[job.id]};
  const cellSize = settings.partMax;
  const gutter = packing.gutter;
  const layers = [];
  const cutDir = path.join(root, 'art/source', job.id, 'parts');
  await fs.mkdir(cutDir, { recursive: true });
  const crops = [];
  const { data: full } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const labels = new Int32Array(meta.width * meta.height);
  const queue = new Int32Array(labels.length);
  const components = [null];
  for (let seed = 0; seed < labels.length; seed++) {
    if (labels[seed] || full[seed * 4 + 3] <= 8) continue;
    const label = components.length;
    let first = 0, last = 1, sx = 0, sy = 0, count = 0;
    queue[0] = seed; labels[seed] = label;
    while (first < last) {
      const p = queue[first++], x = p % meta.width, y = Math.floor(p / meta.width);
      sx += x; sy += y; count++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= meta.width || ny < 0 || ny >= meta.height) continue;
        const np = ny * meta.width + nx;
        if (!labels[np] && full[np * 4 + 3] > 8) { labels[np] = label; queue[last++] = np; }
      }
    }
    const col = Math.min(cols - 1, Math.floor(sx / count / meta.width * cols));
    const row = Math.min(rows - 1, Math.floor(sy / count / meta.height * rows));
    components.push({ group: row * cols + col, count });
  }
  const groups = job.cells.map(() => ({ x1: meta.width, y1: meta.height, x2: -1, y2: -1, count: 0 }));
  for (let p = 0; p < labels.length; p++) {
    const component = components[labels[p]];
    if (!component || component.count < 5) continue;
    const g = groups[component.group];
    if (!g) continue;
    const x = p % meta.width, y = Math.floor(p / meta.width);
    g.x1 = Math.min(g.x1, x); g.x2 = Math.max(g.x2, x);
    g.y1 = Math.min(g.y1, y); g.y2 = Math.max(g.y2, y); g.count++;
  }
  for (let i = 0; i < job.cells.length; i++) {
    const name = job.cells[i];
    if (!name) continue;
    const col = i % cols, row = Math.floor(i / cols);
    const g = groups[i];
    if (g.x2 < 0 || g.count < 80) throw new Error(`${job.id}/${name}: 没有找到独立部件，检查是否与邻图相连。`);
    const left = Math.max(0, g.x1 - 2), top = Math.max(0, g.y1 - 2);
    const width = Math.min(meta.width, g.x2 + 3) - left, height = Math.min(meta.height, g.y2 + 3) - top;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = (y + top) * meta.width + x + left, component = components[labels[p]];
      if (component?.group === i && component.count >= 5) full.copy(pixels, (y * width + x) * 4, p * 4, p * 4 + 4);
    }
    // Connected alpha islands are assigned by their centers, preserving pieces that cross an imagined grid boundary.
    const cropped = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    await fs.writeFile(path.join(cutDir, `${name}.png`), cropped);
    const { data: packed, info: resized } = await sharp(cropped).resize({ width: cellSize, height: cellSize, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    const id = `${job.id}/${name}`;
    layers.push({ input: packed, id, width:resized.width, height:resized.height });
    result.sprites[id] = { atlas: job.id, rect: [0, 0, resized.width, resized.height], sourceRect: [left, top, width, height], sourceSize: [width, height], sourcePng: `art/source/${job.id}/parts/${name}.png`, logicalCanvas: [512, 512] };
    crops.push({ name, alphaFraction: +(1 - g.count / (width * height)).toFixed(4), touchesCellEdge: g.x1 === 0 || g.y1 === 0 || g.x2 === meta.width - 1 || g.y2 === meta.height - 1 });
  }
  const totalArea=layers.reduce((n,l)=>n+(l.width+gutter*2)*(l.height+gutter*2),0);
  const width=Math.min(packing.maxAtlasEdge,Math.max(cellSize+gutter*2,Math.ceil(Math.sqrt(totalArea)*1.1/32)*32));
  let px=gutter,py=gutter,rowHeight=0;
  const composite=[];
  for(const l of layers.sort((a,b)=>b.height-a.height)){
    if(px+l.width+gutter>width){px=gutter;py+=rowHeight+gutter*2;rowHeight=0;}
    result.sprites[l.id].rect[0]=px;result.sprites[l.id].rect[1]=py;
    composite.push({input:l.input,left:px,top:py});px+=l.width+gutter*2;rowHeight=Math.max(rowHeight,l.height);
  }
  const height=Math.ceil((py+rowHeight+gutter)/16)*16;
  if(height>packing.maxAtlasEdge)throw new Error(job.id+': 图集超过微信素材上限，需要拆包。');
  const data = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).webp({ quality: settings.quality, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
  const dest = `art/packed/legacy/${job.name}.webp`;
  await fs.writeFile(path.join(root, dest), data);
  result.files[job.id] = { path: dest, width, height, bytes: data.length, sha256: sha(data), hasAlpha: true, source: job.source, encoding: `WebP quality ${settings.quality}; alpha preserved; tight shelf packing; ${gutter}px gutters` };
  result.sources[job.id] = { path: job.source, width: meta.width, height: meta.height, bytes: source.length, sha256: sha(source), grid: job.grid, cells: crops };
  textureBytes += width * height * 4;
}
result.statistics = { generatedSourceBytes: sourceBytes, generatedWebpBytes: Object.values(result.files).reduce((n, f) => n + f.bytes, 0), decodedTextureBytesIfAllLoaded: textureBytes, transparentParts: Object.keys(result.sprites).length };
await fs.writeFile(path.join(root, 'art/packed-assets.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(result.statistics));
console.log('图格贴边需目检:', Object.entries(result.sources).flatMap(([id, s]) => s.cells.filter(c => c.touchesCellEdge).map(c => `${id}/${c.name}`)).join(', ') || '无');
