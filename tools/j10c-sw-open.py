"""Open the supplied J-10C STEP in SolidWorks and report its structure.

Read-only with respect to the source: the STEP is imported into a new,
unsaved document. Prints document type, components, bodies and bounds (mm).
Usage: python tools/j10c-sw-open.py [assets/models/j10c/J10C.STEP]
"""
import json, sys, time
from pathlib import Path
import pythoncom, win32com.client
from win32com.client import VARIANT

src = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/models/j10c/J10C.STEP').resolve()
out = Path('work/j10c/cad'); out.mkdir(parents=True, exist_ok=True)

sw = win32com.client.Dispatch('SldWorks.Application')
sw.Visible = True
sw.UserControl = True
errors = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
warnings = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
t0 = time.time()
doc = sw.ActiveDoc
if doc is None or Path(doc.GetPathName() or doc.GetTitle()).stem.lower() != src.stem.lower():
    data = sw.GetImportFileData(str(src))
    doc = sw.LoadFile4(str(src), 'r', data, errors)
if doc is None:
    raise SystemExit(f'LoadFile4 failed, error={errors.value}')
kind = {1: 'part', 2: 'assembly', 3: 'drawing'}[doc.GetType()]
report = {'source': str(src), 'type': kind, 'title': doc.GetTitle(), 'seconds': round(time.time() - t0, 1)}

def body_rows(bodies, owner):
    rows = []
    for b in bodies or []:
        box = b.GetBodyBox()
        rows.append({'owner': owner, 'name': b.Name, 'type': b.GetType(),
                     'faces': b.GetFaceCount(), 'min': [box[0]*1000, box[1]*1000, box[2]*1000],
                     'max': [box[3]*1000, box[4]*1000, box[5]*1000]})
    return rows

rows = []
if kind == 'part':
    rows = body_rows(doc.GetBodies2(-1, False), doc.GetTitle())
else:
    comps = doc.GetComponents(False) or []
    report['components'] = len(comps)
    for c in comps:
        rows += body_rows(c.GetBodies2(0), c.Name2)
report['bodies'] = len(rows)
lo = [min(r['min'][i] for r in rows) for i in range(3)]
hi = [max(r['max'][i] for r in rows) for i in range(3)]
report['bounds_mm'] = {'min': lo, 'max': hi, 'size': [hi[i]-lo[i] for i in range(3)]}
(out / 'bodies.json').write_text(json.dumps({**report, 'rows': rows}, indent=1, ensure_ascii=False), encoding='utf8')
print(json.dumps(report, indent=1, ensure_ascii=False))
