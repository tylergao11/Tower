"""Subset the UI typeface to shipped text. Requires fonttools and brotli."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
texts = [root / 'index.html', *sorted((root / 'src').rglob('*.ts'))]
characters = set(''.join(path.read_text(encoding='utf-8') for path in texts))
characters.update(chr(code) for code in range(32, 127))
characters.update('，。！？：；“”‘’（）【】《》、·—…✓×秒波张出战')
font = TTFont(root / 'art/source/fonts/YouSheBiaoTiHei.ttf')
options = subset.Options()
options.flavor = 'woff2'
options.hinting = False
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes={ord(char) for char in characters})
subsetter.subset(font)
font.flavor = 'woff2'
destination = root / 'assets/fonts/tower-display.woff2'
destination.parent.mkdir(parents=True, exist_ok=True)
font.save(destination)
print(f'{destination.name}: {destination.stat().st_size:,} bytes')
