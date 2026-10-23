// Shared anti-washout finish for the F-16CM, J-16 and J-10C skins.
//
// The game lights every MeshStandardMaterial with the sky PMREM
// (scene.environment) on top of the sun, hemisphere and fill lights. At the
// default envMapIntensity of 1 that diffuse sky light fills the shadow side
// of a light-grey airframe until it reads flat and white. The skins therefore
// take less of it, slightly darker paint, a little more roughness (less sun
// sheen) and procedural weathering that breaks up large even panels.

// Sky-environment fill on painted skin (three.js default is 1).
export const SKIN_ENV_INTENSITY = .35;

// GLSL: skinWeather(p, n, tailZ) -> paint multiplier (~0.6..1.0) and
// skinGrime(p) -> 0..1 mottle for roughness. p = rest-pose model metres with
// -Z forward, n = rest-pose normal, tailZ = nozzle station.
export const SKIN_WEATHER_GLSL = `
float sfHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float sfNoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(sfHash(i),sfHash(i+vec3(1.,0.,0.)),f.x),mix(sfHash(i+vec3(0.,1.,0.)),sfHash(i+vec3(1.,1.,0.)),f.x),f.y),
            mix(mix(sfHash(i+vec3(0.,0.,1.)),sfHash(i+vec3(1.,0.,1.)),f.x),mix(sfHash(i+vec3(0.,1.,1.)),sfHash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
float sfFbm(vec3 p){return .5*sfNoise(p)+.3*sfNoise(p*2.13+7.1)+.2*sfNoise(p*4.41+3.7);}
float skinGrime(vec3 p){return sfFbm(p*vec3(1.1,1.1,.55));}
float skinWeather(vec3 p,vec3 n,float tailZ){
 n=normalize(n);
 float mottle=skinGrime(p);                                  // broad, uneven fading of the paint
 float fine=sfNoise(p*11.);                                    // fine grain
 float streak=sfFbm(vec3(p.x*7.,p.y*.30,p.z*7.));             // vertical rain / fluid streaks
 float side=1.-abs(n.y),under=smoothstep(.1,.9,-n.y);
 float aft=smoothstep(tailZ-3.2,tailZ,p.z);                    // engine soot towards the nozzle
 float blotch=smoothstep(.58,.78,sfFbm(p*2.6+11.3));          // scattered dirty / touched-up patches
 float w=mix(.80,1.03,mottle)*mix(.93,1.,fine);
 w*=1.-.10*blotch;
 w*=1.-.17*side*smoothstep(.50,.78,streak);
 w*=1.-.10*under;
 w*=1.-.22*aft*(.55+.45*mottle);
 return w;}
`;
