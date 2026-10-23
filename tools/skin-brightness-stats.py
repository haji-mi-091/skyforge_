# Airframe brightness from the shown/hidden pairs written by
# tools/measure-skin-brightness.mjs. Prints, per aircraft and view: masked
# pixel count, mean and 95th-percentile luminance (sRGB 0..255, Rec.709) and
# the share of near-white pixels (luma >= 235). Also writes a summary JSON.
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image
d=Path(sys.argv[1] if len(sys.argv)>1 else 'work/skin-brightness/before');rows={}
for on in sorted(d.glob('*-on.png')):
    off=on.with_name(on.name.replace('-on.png','-off.png'))
    a=np.asarray(Image.open(on).convert('RGB'),dtype=np.float32);b=np.asarray(Image.open(off).convert('RGB'),dtype=np.float32)
    mask=np.abs(a-b).sum(axis=2)>24
    luma=(a[...,0]*.2126+a[...,1]*.7152+a[...,2]*.0722)[mask]
    key=on.name[:-7];aircraft,view=key.split('-',1) if not key.startswith('f16cm') else ('f16cm-block52',key[len('f16cm-block52-'):])
    if key.startswith('j16-'):aircraft,view='j16',key[4:]
    if key.startswith('j10c-'):aircraft,view='j10c',key[5:]
    r={'pixels':int(mask.sum()),'mean':float(luma.mean()) if luma.size else 0,'p95':float(np.percentile(luma,95)) if luma.size else 0,'white':float((luma>=235).mean()) if luma.size else 0,'std':float(luma.std()) if luma.size else 0}
    rows.setdefault(aircraft,{})[view]=r
for ac,views in rows.items():
    m=np.mean([v['mean'] for v in views.values()]);w=np.mean([v['white'] for v in views.values()]);s=np.mean([v['std'] for v in views.values()])
    print(f'{ac:15s} mean {m:6.1f}  contrast(std) {s:5.1f}  white {w*100:5.1f}%  | '+'  '.join(f"{k}:{v['mean']:.0f}/{v['p95']:.0f}/{v['white']*100:.0f}%" for k,v in views.items()))
(d/'stats.json').write_text(json.dumps(rows,indent=2))
