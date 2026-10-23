# J-16 white-model asset

`j16-white.glb` is a metre-based visual model: +Y up, -Z forward. It is loaded by
`src/visual/J16Model.js` and inspected at `/tools/j16-preview.html`.

The supplied J-11B DWG was imported in SolidWorks 2024 and tessellated per body.
Its 5,341,137 triangles and 6,053 CAD bodies are reference geometry, not the
runtime mesh. The centre body was resurfaced from 205 radial CAD sections,
omitting the original stripes, surface lettering, stores and fragmentary panels.
The double cockpit, probe-free radome, control surfaces, gear and nozzles were
rebuilt as separate parts for the J-16 visual study.

Modelling targets: 21.95 m long, 14.70 m span, 6.36 m high with gear extended.
These are public-data modelling targets, not certified engineering dimensions.
The forebody and taller clipped fins are adjusted independently; the source is
not simply scaled uniformly. No J-16D wingtip electronic-warfare pods are used.

The clean model contains 189,911 triangles, 263 meshes and twelve basic PBR materials.

Aft body and canopy fairing (2026-10-23, after the "36001" reference photo):
from z 5.0 aft, the CAD hull between the engines hands over to a soft union of
smooth primitives (`tailSurface` in `src/visual/jet/j16Tail.js`): two round
engine nacelles, a slim tail beam with a channel each side, and the fin
pedestals. Outboard of |x| ~1.3 m the CAD skin is kept, because the fin roots,
ventral keels and stabilator bearings are fitted to it. Neighbouring sections
are averaged along z to remove the deck waves. The stinger ends in a quarter
ellipse instead of the CAD's abrupt collapse. The drag-chute housing follows the
user's sketch and rear photo: a slim symmetric stinger (trimmed ahead, between
the nacelles) with a thin horizontal side flange ("sheet beam") each side at
mid-height from the nozzle collars aft, kept inside the nozzle petals
(|x| < 0.50 m) and ending in rounded caps before the tip. The bulkhead at z 8.15 is split
into rings so the engine-disc cut opens it. Behind the canopy, the fairing
heights are relaxed (spine, outer edge, canopy rear and the z -2.48 join fixed)
to remove the saddle beside the hump.
The simplified starboard IRST has one conformal housing, a thin window rim and
an opaque black optical dome. Its lower shell samples the actual rebuilt nose
skin and blends into it; the separate oval pedestal and redundant windshield
tip bead are removed. `node tools/check-j16-irst.mjs` checks 15 contact points,
the unobstructed black aperture and the absence of both redundant meshes.
The nose side silhouette is rebuilt from the supplied reference: the radome
ends at z=-8.134 m, with independent upper/lower loft curves and a smooth shared
forebody transition. The canopy sill rises continuously into the aft fairing;
seats, HUD, IRST, refuelling door and canopy actuator follow the revised shell.
The current source is the user's replacement side reference, including their
red correction underneath the IRST. `tools/analyze-j16-orthographic.py` records
raw landmarks, coordinate calibration and fitted controls in `nose-profile.json`
and `canopy-profile.json`. Global curvature-constrained nose curves replace
the older noisy per-point interpolation, eliminating the upper/lower dents.
The lower forebody continues smoothly into the existing aircraft.
The windshield, moving two-seat glazing, sill and frame positions follow the
new coordinates. The rear arch blends into an opaque aft fairing; a narrow
skin seal closes its joint with the original CAD cockpit cut. The pivot clears
the aft fairing throughout opening. Seats, HUD and IRST follow the new shell.
The upper glazing was further refined from the user's annotated comparison
(reference image offset 60,132): the middle/forward crown is fuller, with the
unchanged end points and sill retained. The comparison renders the smooth
interpolated trace rather than straight chords between sparse landmarks.
The nose bay is deeper internally, and an independent stow guide lifts the
folded assembly while preserving the extended wheel contact. This is a visual
clearance mechanism rather than a claim about the real aircraft's linkage.
Run `node tools/check-j16-canopy.mjs` (also selected by check-j16-nose-profile)
to ray-check nose curvature, joint slopes, measured canopy shape, seat/HUD
clearance, five opening poses and the actual orthographic browser camera.
The `profile` preview view matches the 1200x469 reference framing; transverse
width remains a modelling estimate because the reference is a side view.
The dorsal silhouette is revised against the supplied J-16 model side photo:
a raised aft-cockpit fairing blends into a broad, descending upper spine. The
aft glazing/sill, canopy pivot and conforming airbrake follow that surface;
the crown is specified per longitudinal section to avoid an abrupt fall-off on
the low aft fuselage. The reference-direction side view uses a long camera
distance to reduce perspective differences during silhouette comparison.
The wings, intakes and gear meshes retain their geometry. This is a visual shape
study from the reference, not a measurement extracted from an engineering drawing.
The fixed fuselage is split at the aft cockpit and forward tail station for
three modelling work areas; the split retains the original surface normals.

The preview defaults to three work-area colours: blue for the nose, cockpit
and nose gear; orange for the middle fuselage, intakes, main gear and wings;
green for the tail surfaces and engines. Each entire assembly belongs to one
area, including its doors and moving children. Identity groups `workzone_nose`,
`workzone_mid` and `workzone_tail` preserve the existing joint coordinate frames.
`j16-workzones.glb` saves the coloured model and `j16-workzones.json` lists its
members (the GLB is a review snapshot nothing loads; it was moved to
`work/consistency-2_1/moved-assets/j16/` and reappears on a rebuild). `j16-white.glb` keeps the basic materials, with the same work-area
metadata. Select white/base/parts in the preview to restore those material modes.
Named rig nodes, pivots, axes and role metadata are stored as glTF node extras.
The asset has base UV coordinates and plain grey skin; final camouflage,
stencils, weathering and cockpit instrumentation are later texturing work.

Movable assemblies include two leading-edge flaps, two flaperons, two
stabilators, two rudders, dorsal brake, canopy, refuelling probe/door, two intake
ramps, parachute covers, three gear assemblies, independent oleos, six bay doors,
four wheels and 32 nozzle feathers. Preview sliders demonstrate assembly poses;
this is not a completed aircraft hydraulic or flight-control simulation.

Rebuild the runtime GLB from the cleaned reference already included here:

```text
node tools/build-j16-model.mjs
node tests/j16-model.test.mjs
node tests/j16-surfaces.test.mjs
node tools/check-j16-model.mjs
```

The browser check requires the existing local server on port 4173. Full CAD
resurfacing additionally needs the per-body audit/tessellation from SolidWorks;
`tools/build-j16-cad-base.py --help` describes its inputs. This step uses NumPy,
SciPy, trimesh, networkx and fast-simplification in the local modelling workspace.

References:

- [Chinese military imagery and J-16 configuration](https://www.81.cn/bq_208581/jdt_208582/16397209.html)
- [JASDF identification photographs, pp. 6–7](https://www.mod.go.jp/js/pdf/2025/p20251211_02e.pdf)

In the shipping game the J-16 is registered as `j16` with its own flight model,
ten weapon stations and audio (see the end of this file).

Nose/mid surface repair: the authoring build re-tessellates these areas from
unrounded CAD sections, trims the replacement cockpit and speedbrake to shared
openings, and adds intake exterior panels trimmed against the body envelope.
The rear cockpit opening terminates before the full spine arch starts; grid
columns with different widths are not stitched across the cockpit opening.
Bay-door dimensions now match their cutters. The speedbrake has a back face,
edge thickness and recessed well. Surface validation checks exterior coverage,
clear inlet apertures, both cockpit shoulder seams and closed well perimeters.

The intake refinement is authored in `src/visual/jet/j16Intake.js`. It uses the
user's side/front/belly photographs for approximate proportions: 0.90 m mouth
setback, a 0.16 m vertical lower return and an approximately 11 degree outward
cant per inlet. A common loft defines the rounded thin lip, exterior cowl,
fuselage cutter and tapered inner liner. The liner stays inside the nacelle,
separate from the outboard wing-root wheel bays, with moving compression ramps and auxiliary louvre details on the actual
underside. These are visual modelling proportions, not engineering dimensions.
The preview includes intake, intake-front, intake-side and intake-bottom views.
Run `node tests/j16-intake.test.mjs` and `node tools/check-j16-intake.mjs` for
geometry/clearance checks and five rendered inspection views.

Wing-root and landing-gear refinement uses `src/visual/jet/j16LandingGear.js`.
Closed structural root blends join the fuselage to the fixed wing at x=2.74 m;
the slats and flaperons remain independent. The main wells are centred at
x=+/-1.95 m, z=2.65 m and extend into the inner wing. Each main oleo is vertical,
with its single 0.46 m-radius wheel 0.23 m outboard of the strut. The nose gear
uses a central T stem and transverse axle connecting two 0.34 m-radius wheels.
Rounded aviation tires, recessed hubs, axle supports, simple oleos, torque links
and folding braces replace the previous generic gear. Small wiring is omitted.
Mirrored wheel swivels, real bay openings and door actuators retain the same
connected meshes throughout retraction, without hiding or scaling parts.

Run `node tests/j16-landing-gear.test.mjs` for 192 root-coverage probes and 33
retraction/steering/compression states, including actual closed-door clearance,
door surface crossings, axle connections, actuator stroke and stowed mechanisms.
Run `node tools/check-j16-landing-gear.mjs` for close-ups and five retraction
renders. The preview's `gear-front` view shows the corrected wheel attachments.

The tail repair is authored in `src/visual/jet/j16Tail.js`. It replaces the
aft CAD cutouts with a common loft, integrated nacelle shoulders and fin-root
pedestals. Fixed fin/keel roots and the two stabilator bearings are trimmed and
matched to the actual triangulated shell. The stabilators connect through
separate moving trunnions. The rudder hinge line is straight across all three
fin sections, with clearance at its leading and lower edges. Engine collars
and recessed liners use circular sections, with an open exhaust clearance in
the tail shell instead of overlapping rectangular patches.

Run `node tests/j16-tail.test.mjs` for six root seams, 1,280 nacelle coverage
probes, circular collars and 29 moving-surface states. Actual triangle/edge
intersection checks cover fixed and moving surfaces; intended nozzle-feather
overlap and attachment seams are treated as joints. Run
`node tools/check-j16-tail.mjs` for eight inspection renders and tail view controls.

The fin/flap refinement follows the user's annotated belly and fin photographs.
The two fins have sloping clipped tips with closed caps; each rudder terminates
below the upper cap. `j16Wing.js` defines a shared wing outline and straight
leading/trailing hinge lines. One leading-edge flap and one rear flaperon per
wing remain independent, with closed spanwise ends and motion clearance.
`tests/j16-wing.test.mjs` checks 216 wing coverage rays and 21 flap poses.

External stores are authored separately in `src/visual/J16Stores.js`. The ten
photograph-selected stations comprise two tips, four underwing stations, two
nacelle stations and two tandem belly stations. Fitted pylon contact pads sample
the actual skin, and tip adaptors connect the existing rails to the missiles.
The nine visual types are PL-8B, PL-10, PL-12A, PL-15, LD-10, YJ-91A, KD-88A,
LS-6/500 and YINGS-III. Carried LS-6 wings remain folded. Weapon dimensions and
display combinations are approximate visual authoring choices, not a certified
operational loading chart. In game these stores are live weapons (see
`docs/J16_GAME_INTEGRATION.md`).

`j16-stores.glb` contains the separate weapon library; `j16-stores.json` records
all station coordinates, model proportions and display configurations.
`j16-racks.glb`, `j16-modern.glb`, `j16-wiki.glb`, `j16-strike.glb` and
`j16-sead.glb` contain the airframe plus each display configuration. The browser
preview offers the same configurations via its loadout selector or URL parameter
`loadout=modern|wiki|strike|sead|racks|clean`.
`node tools/build-j16-stores.mjs` exports these files. They are review snapshots:
the game loads only `j16-white.glb` and builds stores in code, so the six GLBs were
moved to `work/consistency-2_1/moved-assets/j16/` (a rebuild writes them here again). Run
`node tests/j16-stores.test.mjs` for adjacent-store, skin contact and 85
gear/control poses with triangle intersection checks in both directions; run
`node tools/check-j16-stores.mjs` for rendered close-ups and actual UI verification.

Store references:
- https://wiki.warthunder.com/unit/j_16 (game weapon catalogue; wiki preset)
- https://eng.mod.gov.cn/xb/News_213114/TopStories/4816016.html (PL-10 / PL-15 context)
- https://www.airuniversity.af.edu/Portals/10/CASI/documents/Research/Other-Topics/2024-07-16%20Primer%204th%20ed.pdf (modern J-16 weapons)

Engine/system update: nozzle feathers now have closed inner skins and rim
thickness, alternate heat-tinted metal, moving longitudinal ribs, fixed hinge
bosses, attachment bands, recessed liner ribs and a visible flameholder. The
clean GLB stays below the original 190k-triangle airframe budget. These are
visible-detail approximations, not a cutaway engine model.

`src/visual/J16Systems.js` supplies the two attached exhaust volumes (the shared
afterburner shader of `src/visual/F16Exhaust.js`, used by all aircraft),
blue-to-orange power transition, animated compression cells, actual-petal exit
sampling, textured 30 mm flash and exact-mesh store release. Each store retains
its mounted world pose at release, separates from the carrier and ignites after
a short delay. This controller handles visual motion; guidance, combat damage,
ammunition and inherited carrier velocity are now connected by the shipping
`src/visual/J16Jet.js` adapter and `CombatSystem`.
The preview has throttle, pause/speed, launch-station, gun and audio controls.
Effects are real-time JavaScript/shader animations, not baked GLB clips.

The aircraft is registered as `j16`, selectable in the game hangar with ten
stations. See `docs/J16_GAME_INTEGRATION.md` for runtime parameters, source facts,
explicit game estimates and user acceptance testing. Run `node tests/j16-engine.test.mjs`,
`node tools/check-j16-launch-clearance.mjs` and
`node tools/check-j16-systems.mjs` for nozzle topology, release clearances and
rendered/decoded engine, gun, launch and sound verification.

The default in-game/preview appearance is now `weathered`: service-grey PBR
paint, panel/rivet and stencil atlases, restrained service grime, tinted canopy
and heat-discoloured nozzle metal. Runtime materials in `J16Skin.js` load the
shared PNGs in `assets/textures/j16/` and use bind-pose projection attributes so
the paint follows control surfaces. White/work-zone inspection modes remain.
The white GLB is intentionally kept as the geometry source; the custom runtime
skin shader is not baked into that file. See `docs/J16_SKIN.md` and run
`node tools/check-j16-skin.mjs` for appearance checks and reproducible PNG output.
