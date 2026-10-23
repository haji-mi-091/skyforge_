export const J16_WING=[
 {x:1.76,y:-.77,le:-.24,te:4.78,thickness:.045},
 {x:2.75,y:-.78,le:.69,te:4.96,thickness:.042},
 {x:4.80,y:-.82,le:.69+(4.25-.69)*(4.8-2.75)/(7.17-2.75),te:5.58,thickness:.036},
 {x:7.17,y:-.88,le:4.25,te:6.15,thickness:.030},
];
export function wingAt(x){let i=0;while(i<J16_WING.length-2&&x>J16_WING[i+1].x)i++;const a=J16_WING[i],b=J16_WING[i+1],t=(x-a.x)/(b.x-a.x);return Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*t]));}
export const leadingHingeZ=x=>.6636+(4.592-.6636)*(x-1.76)/(7.17-1.76);
export const leadingFraction=x=>{const s=wingAt(x);return (leadingHingeZ(x)-s.le)/(s.te-s.le);};
export const trailingHingeZ=x=>3.99+(5.41-3.99)*(x-2.80)/(6.10-2.80);
export const trailingFraction=x=>{const s=wingAt(x);return (trailingHingeZ(x)-s.le)/(s.te-s.le);};
