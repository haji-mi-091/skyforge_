"""Export the J-10C STEP already open in SolidWorks: per-face tessellation
plus orthographic reference views.

The STEP is a single part of open B-spline surface shells (no solids).
Outputs (work/j10c/cad/):
  faces.bin      float32 triangles (x,y,z * 3 per tri), source millimetres
  faces.json     per-face index: body, face, triangle range, bounds, area
  view-*.png     SolidWorks orthographic views (front/back/left/right/top/bottom/iso)
Usage: python tools/j10c-sw-export.py   (SolidWorks must have J10C open)
If SolidWorks has nothing open, the STEP is imported from an ASCII copy
(the default part template is pointed at an existing one only during import).
"""
import json, struct, sys, time
from pathlib import Path
import pythoncom, win32com.client
from win32com.client import VARIANT

def call(obj, name, *args):
    attr = getattr(obj, name)
    return attr(*args) if callable(attr) else attr

out = Path('sources/j10c/cad'); out.mkdir(parents=True, exist_ok=True)   # captured input for build-j10c-cad-base.mjs
sw = win32com.client.Dispatch('SldWorks.Application')
sw.Visible = True
doc = sw.ActiveDoc
if doc is None:
    src = r'C:\Users\Public\skyforge-j10c\J10C.STEP'
    orig = call(sw, 'GetUserPreferenceStringValue', 8)
    call(sw, 'SetUserPreferenceStringValue', 8, r'C:\ProgramData\SOLIDWORKS\SOLIDWORKS 2024\templates\gb_part.prtdot')
    try:
        e = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        doc = sw.LoadFile4(src, 'r', call(sw, 'GetImportFileData', src), e)
    finally:
        call(sw, 'SetUserPreferenceStringValue', 8, orig)
    if doc is None:
        sys.exit('STEP import failed')

bodies = call(doc, 'GetBodies2', -1, False) or []
index, chunks, tri_total = [], [], 0
for bi, body in enumerate(bodies):
    faces = call(body, 'GetFaces') or []
    for fi, face in enumerate(faces):
        tris = call(face, 'GetTessTriangles', True)
        if not tris:
            continue
        data = struct.pack('<%df' % len(tris), *[v * 1000 for v in tris])
        n = len(tris) // 9
        box = call(face, 'GetBox')
        index.append({'body': bi, 'bodyName': call(body, 'Name'), 'face': fi, 'start': tri_total, 'count': n,
                      'area_mm2': call(face, 'GetArea') * 1e6,
                      'min': [box[0]*1000, box[1]*1000, box[2]*1000], 'max': [box[3]*1000, box[4]*1000, box[5]*1000]})
        chunks.append(data); tri_total += n
(out / 'faces.bin').write_bytes(b''.join(chunks))
lo = [min(r['min'][i] for r in index) for i in range(3)]
hi = [max(r['max'][i] for r in index) for i in range(3)]
meta = {'units': 'mm (source)', 'bodies': len(bodies), 'faces': len(index), 'triangles': tri_total,
        'bounds': {'min': lo, 'max': hi, 'size': [hi[i]-lo[i] for i in range(3)]}, 'rows': index}
(out / 'faces.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding='utf8')
print(json.dumps({k: v for k, v in meta.items() if k != 'rows'}, indent=1, ensure_ascii=False))

# Orthographic views. Perspective off, shaded with edges, zoom to fit.
try:
    doc.ViewDisplayShaded()
except Exception:
    pass
# swStandardViews_e ids; named-view strings are ignored by late-bound COM.
for name, vid in [('*Front', 1), ('*Back', 2), ('*Left', 3), ('*Right', 4), ('*Top', 5), ('*Bottom', 6), ('*Isometric', 7)]:
    doc.ShowNamedView2('', vid)
    doc.ViewZoomtofit2()
    doc.GraphicsRedraw2()
    time.sleep(1.0)
    # SolidWorks image export is unreliable with non-ASCII paths; stage via Public.
    file = f"view-{name.strip('*').lower()}.png"
    staged = r'C:\Users\Public\skyforge-j10c' + '\\' + file
    e = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0); w = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
    ok = doc.Extension.SaveAs(staged, 0, 1, VARIANT(pythoncom.VT_DISPATCH, None), e, w)
    if ok:
        (out / file).write_bytes(Path(staged).read_bytes())
    print(name, ok, e.value, out / file)
