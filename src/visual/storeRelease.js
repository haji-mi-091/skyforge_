// Keep physical mount identity: count-based hiding emptied an entire wing first.
// A centreline release leaves the next requested side unchanged. Asymmetric
// loadouts use the available side and resume alternation whenever possible.
export function selectMountedStore(stores,type,state){
 const available=stores.filter(s=>s.type===type&&!s.released&&(s.remaining??1)>0);
 const side=s=>Math.abs(s.x??s.group.position.x)<.05?0:Math.sign(s.x??s.group.position.x);
 const wanted=state.nextSide??-1;
 const candidates=available.filter(s=>side(s)===wanted);
 const selected=(candidates.length?candidates:available).sort((a,b)=>Math.abs(b.x??b.group.position.x)-Math.abs(a.x??a.group.position.x))[0];
 return selected||null;
}
export function commitMountedRelease(store,state){
 const x=store.x??store.group.position.x,actual=Math.abs(x)<.05?0:Math.sign(x);
 if(actual)state.nextSide=-actual;
 store.remaining=(store.remaining??1)-1;store.released=store.remaining===0;
}
// Detach every unreleased store on the given stations that passes isTank(store)
// (external-tank jettison, shared by all Jets). Call after the jet's
// updateMatrixWorld(true): each group keeps its world position, rotation and
// scale, is marked released and returned for the caller to add to the scene.
export function detachMountedStores(stores,stations,isTank){
 const out=[];
 for(const store of stores||[]){
  if(store.released||!stations.includes(store.station)||!isTank(store))continue;
  const group=store.group;group.parent?.remove(group);group.matrixWorld.decompose(group.position,group.quaternion,group.scale);
  store.released=true;store.remaining=0;group.visible=true;out.push(group);
 }
 return out;
}
