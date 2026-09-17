import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

// Keep the artist's assets in place; serve and package that same directory.
function gameAssets(): Plugin {
  const root = resolve('assets');
  return {
    name: 'game-assets',
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        if (/[?&]import(?:&|$)/.test(req.url || '')) return next();
        const file = resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        const types: Record<string, string> = { webp: 'image/webp', png: 'image/png', json: 'application/json', mp3: 'audio/mpeg', svg: 'image/svg+xml' };
        res.setHeader('Content-Type', types[file.split('.').pop() || ''] || 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      const manifestPath=resolve(root,'game/asset-manifest.json');
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {files:Record<string,{path:string}>};
      const files=[manifestPath,...Object.values(manifest.files).map(file=>resolve(file.path))];
      for(const file of new Set(files)){
        if(!file.startsWith(root+sep))throw new Error('Asset outside asset directory');
        this.emitFile({type:'asset',fileName:'assets/'+relative(root,file).split(sep).join('/'),source:readFileSync(file)});
      }
    }
  };
}

export default defineConfig({ base: './', plugins: [gameAssets()], server: { port: 5188, strictPort: true }, build: { chunkSizeWarningLimit: 1500 } });
