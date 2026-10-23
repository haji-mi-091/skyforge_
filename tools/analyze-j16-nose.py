"""Approximate photo tracing, not an engineering-angle measurement.

Manual contour seeds are refined against local vertical image contrast. The
straight visible fuselage chine defines projected pitch; the ground does not.
Occluded lower skin behind the clean samples is explicitly labelled inferred.
"""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]
photo=Path('C:/Users/你鸡怒~1/AppData/Local/Temp/codex-clipboard-efcd2b5a-efdc-4c7c-9bb6-def58ea491a2.jpg')
image=np.asarray(Image.open(photo).convert('L'),dtype=float)
upper_seeds=[(96,688),(120,678),(150,663),(180,650),(210,637),(240,626),(270,617),(294,612),(315,607),(330,603)]
lower_seeds=[(96,688),(120,696),(150,702),(180,706),(210,707),(240,706),(270,704),(294,701),(330,697),(350,695),(410,687),(450,683)]
def refine(points,sign):
    result=[]
    kernel=np.array([1,4,6,4,1],dtype=float)/16
    for x,y in points:
        if x in (96,294): result.append([x,y]);continue
        column=np.convolve(image[:,x-2:x+3].mean(axis=1),kernel,'same')
        gradient=column[2:]-column[:-2]
        candidates=np.arange(y-4,y+5)
        yy=int(candidates[np.argmax(sign*gradient[candidates-1])])
        result.append([x,yy])
    return result
upper,lower=refine(upper_seeds,-1),refine(lower_seeds,1)
datum_a=np.array([410.,665.]);datum_b=np.array([1090.,658.])
aft=(datum_b-datum_a);aft/=np.linalg.norm(aft)
forward=-aft;up=np.array([aft[1],-aft[0]])
origin=np.array([294.,(upper[7][1]+lower[7][1])/2])
metres_per_pixel=21.95/(1627-95)
tip=np.array(upper[0]);tip_x=float((tip-origin)@forward*metres_per_pixel)
root_z=-10.975+tip_x
root_y=-.25
def coordinate(p):
    d=np.array(p)-origin
    x,y=float(d@forward*metres_per_pixel),float(d@up*metres_per_pixel)
    return {'pixel':p,'xForward':x,'yUp':y,'z':root_z-x,'modelY':root_y+y}
upper,lower=list(map(coordinate,upper)),list(map(coordinate,lower))
def angle(a,b):
    return math.degrees(math.atan2(b['yUp']-a['yUp'],b['xForward']-a['xForward']))
def forward_angle(a,b):
    if b['xForward']<a['xForward']:a,b=b,a
    return angle(a,b)
def segment(label,a,b):return {'label':label,'angleDeg':forward_angle(a,b)}
angles=[segment('upper chord: root to tip',upper[7],upper[0]),
        segment('lower chord: root to tip',lower[7],lower[0]),
        segment('lower: root to belly minimum',lower[7],lower[4]),
        segment('lower: belly minimum to tip',lower[4],lower[0]),
        segment('underside under cockpit: aft toward root',lower[-1],lower[7])]
centre_tip=coordinate(tip.tolist());centre_root={'xForward':0,'yUp':0}
angles.append(segment('radome centreline: root to tip',centre_root,centre_tip))
audit={'reference':str(photo),'method':'Manual contour seeds with local contrast refinement (+/-4 px); visible fuselage chine sets pitch datum.',
       'uncertainty':'Approximately +/-3 px for traced edge; datum and perspective add about 1-2 degrees to long-chord angle uncertainty. Short local slopes are less certain.',
       'originPixel':origin.tolist(),'forwardPixelUnit':forward.tolist(),'upPixelUnit':up.tolist(),
       'datumImagePitchDeg':math.degrees(math.atan2(-aft[1],aft[0])),
       'metresPerPixel':metres_per_pixel,'radomeRootZ':root_z,'modelRootY':root_y,
       'upper':upper,'lower':lower,'angles':angles,
       'occludedLowerRangePixels':[480,640],
       'occlusionNote':'Store/gear obscure the underside here. Continue the visible forebody slope smoothly, then blend into the unchanged intake region.'}
dest=root/'assets/models/j16/nose-profile-perspective-study.json';dest.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'datumPitchDeg':audit['datumImagePitchDeg'],'radomeRootZ':root_z,'angles':angles,'upperPixels':[p['pixel'] for p in upper],'lowerPixels':[p['pixel'] for p in lower]},ensure_ascii=False,indent=2))
