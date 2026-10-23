"""Trace the user's replacement side reference, including their IRST correction.
Keep raw landmarks separate from the smooth, curvature-constrained nose fits.
"""
from pathlib import Path
import json
import numpy as np
base=Path(__file__).resolve().parents[1]/'assets/models/j16'
reference='C:/Users/你鸡怒~1/AppData/Local/Temp/codex-clipboard-93f8bfdb-d018-4a54-a895-2d14fab5a8e0.png'
root_z=-8.133624689377072;tip_z=-10.975
ppm=(1155-800)/(root_z-tip_z);origin=[800,313];root_y=-.25
def point(x,y):
    return {'pixel':[float(x),float(y)],'xForward':float((x-800)/ppm),'yUp':float((313-y)/ppm),'z':float(tip_z+(1155-x)/ppm),'modelY':float(root_y+(313-y)/ppm)}
upper=np.array([[710,213],[760,224],[800,236],[840,243],[880,250],[920,258],[960,269],[1000,283],[1040,300],[1080,320],[1120,341],[1155,358]],float)
lower=np.array([[650,387],[710,389],[780,391],[800,391],[860,392],[920,391],[980,389],[1040,383],[1100,371],[1155,358]],float)
def fit(raw,convex):
    x0,y0=raw[0];x1,y1=raw[-1];t=(raw[:,0]-x0)/(x1-x0)
    B=np.array([(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3]).T
    rhs=raw[:,1]-B[:,0]*y0-B[:,3]*y1
    c1,c2=np.linalg.lstsq(B[:,1:3],rhs,rcond=None)[0]
    # If the unconstrained fit has a wrong-signed curvature at the body join,
    # fit on that constraint boundary. Both Bernstein second differences then
    # have the required sign throughout the complete cubic, not just at knots.
    if convex*(c2-2*c1+y0)<0:
        v=B[:,1]+2*B[:,2];c1=float(v@(rhs+B[:,2]*y0)/(v@v));c2=2*c1-y0
    controls=np.array([y0,c1,c2,y1])
    assert np.all(convex*np.diff(controls,2)>=-1e-9)
    assert (controls[-1]-controls[-2])>0 if convex>0 else (controls[-1]-controls[-2])<0
    u=np.linspace(0,1,97);basis=np.array([(1-u)**3,3*u*(1-u)**2,3*u*u*(1-u),u**3]).T
    pts=[point(x0+(x1-x0)*q,y) for q,y in zip(u,basis@controls)]
    return list(reversed(pts)),{'xRange':[x0,x1],'controlY':controls.tolist(),'pixelRms':float(np.sqrt(np.mean((B@controls-raw[:,1])**2)))}
up,upfit=fit(upper,1);low,lowfit=fit(lower,-1)
canopy_top_previous=[[255,73],[300,73],[350,77],[400,86],[450,100],[500,120],[550,141],[600,162],[650,181],[680,195],[710,213]]
# Corrected from the user's upper red stroke in the annotated report. Its
# reference image starts at report pixel (60,132); these are image coordinates,
# not an arbitrary height offset applied to the old canopy.
canopy_top=[[255,73],[300,73],[350,74],[400,77],[450,89],[500,107],[550,126],[600,151],[650,175],[680,190],[710,213]]
canopy_sill=[[255,134],[300,150],[350,163],[400,175],[450,185],[500,194],[550,202],[600,209],[650,212],[680,213],[710,213]]
canopy={'reference':reference,'originPixel':origin,'metresPerPixel':1/ppm,'forwardPixelUnit':[1,0],'upPixelUnit':[0,-1],
        'upper':[point(*p) for p in canopy_top],'sill':[point(*p) for p in canopy_sill],
        'upperPrevious':[point(*p) for p in canopy_top_previous],
        'correction':{'annotation':'C:/Users/你鸡怒~1/AppData/Local/Temp/codex-clipboard-f5e7af29-8393-434e-8f90-13d8460d7c87.png','referenceImageOffsetInReport':[60,132],'method':'Upper red stroke sampled at the original image columns, with one-pixel stroke-edge allowance.'},
        'aftPixel':255,'frontPixel':710,'windscreenFramePixel':565,'centreFramePixel':420,
        'rearZ':point(255,134)['z'],'frontZ':point(710,213)['z'],'hingeY':point(255,73)['modelY'],'rearSillY':point(255,134)['modelY'],
        'widths':[[point(x,0)['z'],w] for x,w in [[710,.015],[680,.15],[650,.28],[600,.43],[565,.53],[500,.60],[420,.63],[350,.62],[300,.60],[255,.55]]],
        'dorsal':[point(*p) for p in [[0,133],[50,119],[100,105],[150,91],[200,79],[255,73]]],
        'note':'Rear glass bulkhead at x=255. The cropped aft fairing follows the visible reference; lateral width is retained as a modelling choice because a side view does not measure it.'}
trace={'reference':reference,'method':'New side reference; manual visible landmarks and user-supplied IRST correction; curvature-constrained cubic nose fits.',
       'originPixel':origin,'forwardPixelUnit':[1,0],'upPixelUnit':[0,-1],'metresPerPixel':1/ppm,'datumImagePitchDeg':0,
       'radomeRootZ':root_z,'modelRootY':root_y,'upper':up,'lower':low,
       'rawUpper':[point(*p) for p in upper],'rawLower':[point(*p) for p in lower],
       'upperFit':upfit,'lowerFit':lowfit,'irstCorrectionPixels':[[664,183],[710,213],[668,212]],
       'canopy':canopy,'uncertainty':'Approximate tracing of a supplied side illustration; pixels are measured, lateral widths and hidden structure are modelling estimates.'}
(base/'nose-profile.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(base/'canopy-profile.json').write_text(json.dumps(canopy,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pixelsPerMetre':ppm,'upperFit':upfit,'lowerFit':lowfit,'canopyRearZ':canopy['rearZ'],'canopyFrontZ':canopy['frontZ'],'hingeY':canopy['hingeY']},indent=2))
