# J-10C white-model asset

`j10c-white.glb` is a metre-based visual model: +Y up, -Z forward, ground at
y = -2.30 with the gear extended. It is loaded by `src/visual/J10CModel.js`
(`loadJ10CModel`, `poseJ10C`, `paintJ10C`) and inspected at
`/tools/j10c-preview.html`.

## In the game

The J-10C is registered as `j10c` (hangar button 歼-10C, or
`/?aircraft=j10c`). Pieces:

- `src/data/j10cWiki.js` — War Thunder wiki stat card (RB reference), generated
  by `tools/import-j10c-wiki.py` from the saved page
  `sources/wiki/j10c.html`: speed, climb, turn, mass, fuel,
  limits, WS-10B thrust, Type 23-3 cannon, payload limits, 11-slot pylon table.
- `src/data/j10c.js` — config. Radar, RWR, countermeasures and alerts are the
  J-16's (F-16CM Block 52 avionics). Aero/engine coefficients are authored so
  the shared flight model gives 2241 km/h at 12 km (wiki 2203), 285 m/s best
  climb (295) and an 18.7 s sustained turn (20). Flap detents use the shared
  `flapPitchMoment` trim scheme (1 g reference in up / takeoff / landing),
  `mainGearZ` 1.60, `takeoffPitchDeg` 4. Because the FBW holds 1 g, flap lift
  shows up as a nose drop; the flap lift increments are small (0.22 / 0.12),
  so selecting or retracting flaps moves the nose under 2° (G 0.93–1.07).
  Hands-off liftoff ~450 km/h in ~820 m; rotating from 280 km/h lifts off at
  ~330 km/h.
- `src/data/j10cWeapons.js` — the J-16 weapon objects on 11 hardpoints; which
  store fits which slot comes from the wiki table (PL-10 / PL-15 where it
  allows PL-8B / PL-12A). Payload 7000 kg, 3500 kg per side, 1750 kg imbalance.
  Not offered (missing from the J-16 set): Type 130-2 rockets, triple racks,
  twin PL-12, drop tanks.
- `src/visual/J10CJet.js`, `J10CStores.js` — game-side airframe, pylons,
  release, afterburner plume and muzzle flash; paint `base` (基础外观, the
  weathered PLAAF service grey, `paintJ10C` mode `service`) or `bayi`
  (八一涂装), switched in the hangar (外观) and remembered per browser. Both use
  the shared anti-washout finish `src/visual/skinFinish.js`.
- `audio/j10c/` — decoded from the local War Thunder banks by
  `tools/extract-j10c-audio.py` (`sources.json` has origin and hashes). War
  Thunder has no J-10-specific engine recording; the AL-31F (Su-27) set stands
  in, as for the J-16. Cannon: GSh-23 clips (the Type 23-3 is a GSh-23).
- Keys as on the J-16: B drag chute (on the ground), J fuel dump, K cannon belt.
  No cockpit interior yet: cockpit view shows the external model.

Checks: `node tests/j10c-integration.test.mjs` (data, stations, presets,
performance vs wiki, trim) and `node tools/check-j10c-integration.mjs`
(in-game smoke check, needs the server on 4173). Shared files touched were
backed up to `work/j10c/backup/before-integration/`.

Open items: user flight feedback pending; no cockpit interior (deferred by the
user); the shared ground-rotation cap is 14° while the J-10C tail strikes at
about 12°; drop tanks, Type 130-2 rockets, triple racks and twin PL-12 are not
offered; the refuelling probe stays stowed in game (no key). Testing notes:
r128 `Box3.setFromObject` inflates boxes of rotated meshes (tests use vertex
boxes); rays exactly on a lathe axis slip through pinholes; canvas decals read
through custom samplers need manual sRGB decoding.

## Source

- `J10C.STEP` — the supplied 1:10 surface model (SolidWorks 2020 AP203, one
  part, 23 bodies / 413 open B-spline faces). Read-only input, kept in the local
  working copy only: it is **not** in the repository (see `.gitignore`), because
  the game never reads it — only the SolidWorks export tool does. The
  tessellated outputs it produced are committed under `sources/j10c/cad/`.
- `tools/j10c-sw-export.py` imports it in SolidWorks 2024 (from an ASCII copy in
  `C:\Users\Public\skyforge-j10c`; the default part template is pointed at
  `gb_part.prtdot` only for the import and restored), tessellates every face and
  saves seven orthographic SolidWorks views to `work/j10c/cad/`.
- `tools/build-j10c-cad-base.mjs` scales by 0.01 (1:10 mm -> full-size m), turns
  the nose from +Z to -Z and writes `j10c-cad-reference.glb`, one mesh per CAD
  face (`cad_bXX_fYYY`). The photos in this folder are visual references only.

Length and span follow the CAD: 17.05 m long, 9.73 m span. Public figures
disagree (16.43 / 16.9 m long, 9.75 m span, height 4.78 / 5.43 / 5.5 m) and no
public source gives gear track or ground clearance, so the ground plane
(y = -2.30) is measured on the reference photos: the intake lower lip stands
about 1.2 m off the ground (side close-up and head-on view). Overall height on
the gear is therefore 5.80 m.

## What is CAD and what is rebuilt

Kept from the CAD shell: fuselage, radome, DSI intake and duct, wings,
canards, fin, rudder skins, ventral fins, IRST housing, fixed starboard
refuelling probe, canopy glazing, windscreen and small fairings. Flush surface
lettering and roundels are separate CAD faces in the same white material, so
they were kept rather than cut out.

Wing movables follow an underside photo of an in-service J-10C: a
constant-width leading-edge flap along the whole leading edge (x 1.58..4.55,
0.48 -> 0.36 m chord, two sections split at x 3.05), cut from the CAD wing so
it keeps the true section, and two elevons per side on the z 4.36 hinge.
The CAD tip outboard of the flap (x > 4.552) had a stepped tip shoe; it is
rebuilt per the user's marked-up plan view: the outer elevon stops at x 4.50
(red line) and the whole tip outboard is fixed, its leading edge carried
straight out to x 4.865 (span 9.73 m; each side continues its own measured
leading edge, the CAD port wing sits up to 9 cm further forward), with the
trailing corner cut by a quarter-ellipse back to x 4.63 (blue line).

IRST: the faceted CAD box is replaced by a smooth teardrop fairing on the
starboard nose carrying a dark optical ball.

Refuelling probe (`probe` 0 stowed .. 1 extended): the CAD probe was a fixed
curved boom; it is rebuilt as a straight retractable probe hinged where the
CAD probe met the skin. Stowed it lies aft along the starboard cockpit side in
a bay (cut skin = door, hinged at the lower edge, opens to 90 degrees first),
clear of the canopy sill and the canard root; extended it points at the CAD
probe tip. This is a visual mechanism (the in-service J-10C probe is fixed).

Gun port: sources put the internal 23 mm cannon on the port forward fuselage
above the nose gear; a dark port sits on the lower port intake-trunk side at
z -3.32. Its muzzle point and the nozzle exit are stored in the root extras
(`gunMuzzle`, `nozzleExit`) for runtime effects.

Runtime effects (`src/visual/J10CEffects.js`, not in the GLB):
`addJ10CEffects(model)` then `updateJ10CEffects(model, {afterburner,
nozzle, firing, pressure}, time)` each frame. The afterburner plume is the
shared afterburner shader of `src/visual/F16Exhaust.js` (same as the F-16 and
J-16): blue while the afterburner lights, orange at full afterburner
(`exhaustBlueMix`), ray-marched shock cells (Mach rings) carrying an animated
noise texture. The muzzle flash is crossed star sprites and a flame cone
re-randomised every frame while `firing`.

The CAD intake duct ends at z 1.887 in a 0.55 m circle on the engine axis; a
forward-facing compressor face and an engine case close it, so the intake
shows the compressor, never the empty fuselage or the rear engine parts.

Rebuilt: closed elevons (the CAD has single drooped sheets), hinge-line spar
caps, cockpit tub / seat / panel / HUD, nose and main wheel wells, doors, gear
legs and wheels, nozzle shroud with 16 petals, engine liner and turbine face,
airbrake wells, and a raised duct floor over the nose well. The CAD's hanging
main-gear door bodies were removed.

### 尾喷管重做（2026-10-23）

按用户提供的闭合状态照片重做尾喷管：较亮的拉丝银色固定环、16 片带弧度和薄壁的搭接金属喷瓣、暗色内衬及略有起伏的出口边缘。外喷瓣采用灰褐色热金属，加入分片色差、根部氧化、出口蓝灰热烧痕和纵向断续磨痕；细节随各喷瓣一起运动。比例、闭合／展开口径及材质数值为参照照片的制作值，不代表实机发动机测量数据。

沿用原有 `nozzle-petal` 铰链和 `nozzle` 0..1 状态：0 为照片中的收拢状态，1 为加力全开。`J10CJet` 在常规推力（包括军推）下保持收拢，只随 `flight.afterburner` 平滑展开／收回；喷瓣通过铰链刚性旋转，不逐帧改顶点、隐藏或缩放。尾焰继续使用共享 `F16Exhaust.js`，仅将入口口径和轴向位置跟随实际喷瓣唇口。预览页和导出模型默认收拢；预览的“喷口”滑块可单独查看完整行程。

修改限于 J-10C 尾喷管几何、材质和开合及相应导出／说明；机身、翼面、起落架、挂载、涂装和仿真参数沿用原实现。通过 `tools/build-j10c-model.mjs` 重新生成正式模型与对应审计文件。用户要求只做语法检查，本轮不运行模型／游戏／飞行测试，不截图或做视觉验收；本文此前的检查记录不能视为此次重做的验证。

The CAD belly is already open for the wells: nose x ±0.27, z -2.95..-1.35;
main x 0.26..0.64 beside the keel, with a ragged trimmed edge. The skin is cut
back to one exact rectangle (x 0.255..0.80, z -0.12..1.86) shared by the door,
the opening edge and the well walls; the door laps it by 5 mm. Over the nose
well the duct floor rises as a smooth hump (duct colour) so stowed nose wheels
stay out of the duct. The CAD wing-root fairing (x 0.92..1.5, z 3.1..4.36) had
no lower skin; a closure panel is added so the elevon root meets a closed
section. Main struts hang at the
well's outer edge and are splayed 21° outboard; retraction un-splays, swings
them forward and turns the stub axle upright so the wheel lies flat in the well.
This is a visual mechanism, not a claim about the real linkage. Airbrake
position (lower rear fuselage sides, z 4.55..5.40) is an estimate from photos.

## Movable assemblies

| role | count | state key |
|---|---|---|
| canopy (rear hinge) | 1 | `canopy` 0..1 |
| canard (all-moving) | 2 | `canards` -1..1 |
| slat (leading-edge flap, 2 per side) | 4 | `slats` 0..1 |
| elevon (inner/outer per side) | 4 | `pitch`, `roll` -1..1 |
| rudder | 1 | `yaw` -1..1 |
| airbrake | 2 | `airbrake` 0..1 |
| parachute-door | 2 | `parachute` 0..1 |
| gear-fold / shock / wheel-carrier / wheel | 3/3/3/4 | `gear`, `compression`, `steer`, `wheelSpin` |
| gear-door | 4 | follows `gear` |
| nozzle-petal | 16 | `nozzle` 0..1 |
| probe (fixed on J-10C) | 1 | — |

Each assembly is a named rig node with `role`, `axis`, `pivot` and a calibrated
`dir` in its glTF extras; meshes are stored relative to the hinge.

## Ba Yi livery

`paintJ10C(root,'bayi')` (preview default, `src/visual/J10CLivery.js`) paints
the August 1st aerobatic-team scheme after the user's paper-model photo: blue
upper surfaces, white lower fuselage, a red cheat line from the nose tip to the
nozzle, white root saw-tooth flashes with red edges on the upper wing, white
canard leading edges and tips, white fin flash, white fin and wing tips, PLAAF
roundels on the fin, the wings (top and bottom) and the rear fuselage, and
"中国空军" on the intake sides. Areas the photo does not show are designed to
match: white wing undersides with blue outer panels behind a red saw edge,
blue belly with a white red-edged centre stripe, blue ventral fins with white
lower edges.

It is a shader, not a texture: the pattern is computed per pixel in rest-pose
model space (so it stays on each control surface and door as it moves) from
the mesh's region (fuselage, wing, LE flap, canard, fin, ventral fin, taken
from its name) and height. The fuselage split uses height, not the normal,
because some door skins carry flipped normals. Roundels and lettering are
canvas textures made in the browser; the GLB stays plain white.

Work areas (preview default colours): blue nose (radome, cockpit, canards,
nose gear), orange middle (intake, wings, slats, elevons, main gear), green
tail (fin, rudder, ventral fins, airbrakes, nozzle, drag-chute housing).

## Budget

About 86k triangles in 80-odd meshes, under the F-16CM runtime GLB (~189k).

## Rebuild and check

```text
python tools/j10c-sw-export.py        # only when the STEP changes; needs SolidWorks
node tools/build-j10c-cad-base.mjs
node tools/build-j10c-model.mjs
node tests/j10c-model.test.mjs
node tools/check-j10c-model.mjs       # needs the local server on port 4173
node tools/audit-j10c-airframe.mjs    # hole / clipping audit, 14 views x 2 poses
```

The audit renders the closed aircraft with interior structure red and the
background green; `work/j10c/audit/audit.json` lists any interior pixels with
their 3D positions. Expected hits are only the intake mouth and the nozzle.

The browser check writes its renders to `work/j10c/`.
