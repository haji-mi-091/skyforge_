"""Clean the supplied J-11 CAD into a J-16 modelling reference shell.

Input: SolidWorks IFace2 tessellation and the per-body audit in --source.
The DWG and SLDPRT are read-only inputs. Surface lettering, panel strips,
stores, original gear/canopy/control surfaces are deliberately not carried over.
"""
import argparse,json,sys
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--deps',required=True)
args=p.parse_args();sys.path.insert(0,args.deps)
import trimesh,fast_simplification
from scipy.ndimage import gaussian_filter,median_filter
base=Path(args.source);dest=Path(__file__).resolve().parents[1]/'assets/models/j16';dest.mkdir(parents=True,exist_ok=True)
data=json.loads((base/'body-audit.json').read_text(encoding='utf8'))
raw=np.memmap(base/'j11-bodies.bin',dtype='<f4',mode='r');center=np.array(data['center']);scale=data['scale']

def clip(poly,fn,positive=True):
    if not len(poly):return []
    out=[];a=poly[-1];da=fn(a)*(1 if positive else -1)
    for b in poly:
        db=fn(b)*(1 if positive else -1)
        if (da>=0)!=(db>=0):out.append(a+(b-a)*da/(da-db))
        if db>=0:out.append(b)
        a=b;da=db
    return out

def subtract(poly,planes):
    # Return the outside of a convex cutter as disjoint convex polygons.
    inside=poly;outside=[]
    for plane in planes:
        out=clip(inside,plane,False)
        if len(out)>=3:outside.append(out)
        inside=clip(inside,plane,True)
        if len(inside)<3:break
    return outside

cutters=[
    # Replacement double cockpit and dorsal speedbrake.
    [lambda p:p[2]+7.58,lambda p:-2.48-p[2],lambda p:p[1]+.30,lambda p:.82-p[0],lambda p:.82+p[0]],
    [lambda p:p[2]+2.35,lambda p:.62-p[2],lambda p:p[1]+.20,lambda p:.49-p[0],lambda p:.49+p[0]],
    # Nose and main wheel wells have actual openings, not black patches.
    [lambda p:p[2]+5.03,lambda p:-2.23-p[2],lambda p:-.89-p[1],lambda p:.37-p[0],lambda p:.37+p[0]],
]
for side in [-1,1]:
    cutters.append([lambda p:p[2]-.95,lambda p:3.75-p[2],lambda p:-1.34-p[1],lambda p,s=side:.49-(p[0]-s*1.08),lambda p,s=side:.49+(p[0]-s*1.08)])
    cutters.append([lambda p:p[2]+2.20,lambda p:-.78-p[2],lambda p:p[1]+1.66,lambda p:-.88-p[1],lambda p,s=side:.51-(p[0]-s*1.075),lambda p,s=side:.51+(p[0]-s*1.075)])
    cutters.append([lambda p:p[2]-8.31,lambda p:p[1]+1.85,lambda p:-.58-p[1],lambda p,s=side:.62-(p[0]-s*1.075),lambda p,s=side:.62+(p[0]-s*1.075)])
    bore=[lambda p:p[2]-7.48]
    for angle in np.arange(20)*np.pi/10:
        bore.append(lambda p,s=side,a=angle:.445-np.cos(a)*(p[0]-s*1.075)-np.sin(a)*(p[1]+1.14))
    cutters.append(bore)
# Recess for the port retractable refuelling probe.
cutters.append([lambda p:p[2]+7.14,lambda p:-5.85-p[2],lambda p:p[1]+.56,lambda p:-.30-p[1],lambda p:-.44-p[0]])

source_triangles=[];kept=[];removed=0
for row in data['bodies']:
    mn=np.array(row['min']);mx=np.array(row['max'])
    if row['type']!=1 or row['area']<.085 or mx[0]-mn[0]<1e-5:
        removed+=1;continue
    # Wing and fin skins are remade; the reference here is the body envelope.
    if mx[1]>.65 and mn[2]>3.8:removed+=1;continue
    if (mn[0]>1.72 or mx[0]<-1.72) and mx[2]<6.6 and mx[1]-mn[1]<.50:removed+=1;continue
    pts=(np.asarray(raw[row['offset']//4:row['offset']//4+row['floats']]).reshape(-1,3).astype(float)-center)*scale
    pts=pts[:,[1,2,0]]
    start=len(source_triangles)
    for tri in pts.reshape(-1,3,3):
        poly=list(tri)
        # The body boundary is retained; wings and tails are remade as clean
        # airfoils with independent leading/trailing sections and hinge cuts.
        poly=clip(poly,lambda p:1.80-p[0]);poly=clip(poly,lambda p:p[0]+1.80)
        poly=clip(poly,lambda p:8.42-p[2]) if mn[0]>.55 or mx[0]<-.55 else poly
        if mn[2]>4.5:poly=clip(poly,lambda p:p[1]+1.78)
        if len(poly)<3:continue
        for i in range(1,len(poly)-1):source_triangles.append([poly[0],poly[i],poly[i+1]])
    if len(source_triangles)>start:kept.append(row['index'])

# Re-topologise the CAD envelope: radial intersections with real CAD sections
# retain the Flanker shoulders and twin nacelle lobes, but leave no narrow panel
# strips or isolated decal surfaces in the delivered white model.
source=np.asarray(source_triangles);zlo=source[:,:,2].min(axis=1);zhi=source[:,:,2].max(axis=1)
zs=np.linspace(-7.58,10.975,205);angles=np.arange(128)*np.pi/64
directions=np.stack([np.cos(angles),np.sin(angles)],axis=1)
centers=np.interp(zs,[-7.58,-3,0,3,8.3,10.975],[-.70,-.64,-.78,-.88,-.72,-.57])
radii=[]
cross=lambda a,b:a[...,0]*b[...,1]-a[...,1]*b[...,0]
for z,cy in zip(zs,centers):
    ts=source[(zlo<=z+1e-7)&(zhi>z+1e-7)]
    edges_a=[];edges_b=[]
    for ia,ib in [(0,1),(1,2),(2,0)]:
        a=ts[:,ia];b=ts[:,ib]
        hit=(a[:,2]<=z)!=(b[:,2]<=z)
        a=a[hit];b=b[hit]
        f=(z-a[:,2])/(b[:,2]-a[:,2])
        pts=a[:,:2]+(b[:,:2]-a[:,:2])*f[:,None]
        # Keep triangle ids so the two edge intersections form a segment.
        edges_a.extend(zip(np.flatnonzero(hit),pts))
    groups={}
    for i,point in edges_a:groups.setdefault(i,[]).append(point)
    segs=np.asarray([points[:2] for points in groups.values() if len(points)>=2])
    ring=np.full(len(angles),np.nan)
    if len(segs):
        starts=segs[:,0]-np.array([0,cy]);delta=segs[:,1]-segs[:,0]
        for i,d in enumerate(directions):
            den=cross(d,delta);valid=np.abs(den)>1e-10
            r=np.divide(cross(starts,delta),den,out=np.zeros_like(den),where=valid)
            t=np.divide(cross(starts,d),den,out=np.zeros_like(den),where=valid)
            hits=r[valid&(t>=-1e-7)&(t<=1+1e-7)&(r>0)]
            if len(hits):ring[i]=max(hits)
    ok=np.isfinite(ring)
    if ok.sum()>3:ring=np.interp(np.arange(len(angles)),np.flatnonzero(ok),ring[ok],period=len(angles))
    else:ring[:]=radii[-1] if radii else .6
    # Mirror the source at the centreline, eliminating irrelevant CAD asymmetry.
    mirror=(64-np.arange(128))%128;ring=(ring+ring[mirror])*.5
    radii.append(ring)
radii=np.asarray(radii)
radii=median_filter(radii,size=(9,1),mode='nearest')
radii=gaussian_filter(radii,sigma=(4.0,2.0),mode=('nearest','wrap'))
for i,z in enumerate(zs):
    if z<-6.95:
        shape=1/np.sqrt((directions[:,0]/.612)**2+(directions[:,1]/.61)**2)
        blend=np.clip((z+7.58)/.63,0,1);radii[i]=shape*(1-blend)+radii[i]*blend
    if z>10.80:radii[i]*=max(.003,(10.975-z)/.175)
points=[]
for z,cy,ring in zip(zs,centers,radii):points.append(np.column_stack([directions[:,0]*ring,cy+directions[:,1]*ring,np.full(128,z)]))
points=np.asarray(points)
(dest/'cad-profile.json').write_text(json.dumps({'z':zs.tolist(),'centerY':centers.tolist(),'radii':np.round(radii,6).tolist()},separators=(',',':')),encoding='utf8')
triangles=[]
for i in range(len(zs)-1):
    for j in range(128):
        a=points[i,j];b=points[i,(j+1)%128];c=points[i+1,(j+1)%128];d=points[i+1,j]
        for tri in [[a,b,c],[a,c,d]]:
            polys=[tri]
            for cutter in cutters:
                polys=[piece for candidate in polys for piece in subtract(candidate,cutter)]
                if not polys:break
            for poly in polys:
                for k in range(1,len(poly)-1):triangles.append([poly[0],poly[k],poly[k+1]])

pts=np.array(triangles).reshape(-1,3)
# Close sub-centimetre CAD panel seams before computing smooth normals.
verts,inv=np.unique(np.round(pts/.0025).astype(np.int64),axis=0,return_inverse=True)
vertices=np.zeros((len(verts),3));counts=np.bincount(inv)
for j in range(3):np.add.at(vertices[:,j],inv,pts[:,j])
vertices/=counts[:,None]
mesh=trimesh.Trimesh(vertices=vertices,faces=inv.reshape(-1,3),process=True)
mesh.update_faces(mesh.nondegenerate_faces());mesh.update_faces(mesh.unique_faces());mesh.remove_unreferenced_vertices()
if len(mesh.faces)>65000:
    v,f=fast_simplification.simplify(mesh.vertices,mesh.faces,target_count=65000,agg=4)
    mesh=trimesh.Trimesh(v,f,process=True)
mesh.fix_normals(multibody=True)
mesh.visual=trimesh.visual.TextureVisuals(uv=mesh.vertices[:,[0,2]]/6,
    material=trimesh.visual.material.PBRMaterial(name='J16 basic airframe skin',baseColorFactor=[185,190,195,255],metallicFactor=.08,roughnessFactor=.72,doubleSided=True))
scene=trimesh.Scene();scene.add_geometry(mesh,node_name='J16_CAD_clean_fixed_shell',geom_name='J16_CAD_clean_fixed_shell')
(dest/'j16-cad-base.glb').write_bytes(trimesh.exchange.gltf.export_glb(scene))
report={'sourceBodies':6053,'sourceTriangles':sum(r['triangles'] for r in data['bodies']),
 'referenceBodyCount':len(kept),'omittedBodyCount':6053-len(kept),'fixedShellTriangles':len(mesh.faces),
 'retainedBodies':kept,'sourceScale':scale,'sourceCenter':center.tolist(),'axes':{'forward':'-Z','up':'+Y'},
 'sectionCount':205,'sectionSegments':128,
 'note':'Central CAD shell resurfaced from radial CAD sections; all control surfaces, cockpit, radome, gear, nozzles and bay structures are separate rebuilt meshes.'}
(dest/'cad-conversion.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='retainedBodies'},indent=2))
