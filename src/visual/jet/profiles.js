/**
 * Purely visual airframe descriptions. Flight physics lives in data/aircraft.js;
 * these profiles describe silhouettes, panel construction and animation anchors.
 * All coordinates are metres in Three.js local space (nose = -Z, right = +X).
 */
export const JET_PROFILES = {
  falcon: {
    scheme: 'falcon',
    fuselage: [
      { z: -8.05, width: 0.02, height: 0.02, y: -0.02 },
      { z: -7.6, width: 0.18, height: 0.20, y: 0.02 },
      { z: -6.95, width: 0.38, height: 0.36, y: 0.07 },
      { z: -6.15, width: 0.58, height: 0.51, y: 0.12 },
      { z: -5.35, width: 0.69, height: 0.62, y: 0.17 },
      { z: -4.6, width: 0.74, height: 0.70, y: 0.21 },
      { z: -3.9, width: 0.79, height: 0.76, y: 0.22 },
      { z: -3.1, width: 0.84, height: 0.79, y: 0.20 },
      { z: -2.2, width: 0.92, height: 0.84, y: 0.15 },
      { z: -1.2, width: 1.02, height: 0.86, y: 0.11 },
      { z: -0.2, width: 1.10, height: 0.87, y: 0.08 },
      { z: 0.9, width: 1.13, height: 0.86, y: 0.04 },
      { z: 2.0, width: 1.10, height: 0.84, y: 0.01 },
      { z: 3.1, width: 1.02, height: 0.78, y: 0.0 },
      { z: 4.2, width: 0.94, height: 0.71, y: 0.02 },
      { z: 5.2, width: 0.84, height: 0.63, y: 0.04 },
      { z: 6.1, width: 0.70, height: 0.55, y: 0.05 },
      { z: 6.75, width: 0.58, height: 0.48, y: 0.06 },
    ],
    noseBreak: -6.0,
    wing: [
      { x: 0.55, y: 0.10, zLE: -1.25, zTE: 3.20, thickness: 0.055, camber: 0.006 },
      { x: 2.8, y: 0.13, zLE: -0.55, zTE: 3.18, thickness: 0.048, camber: 0.005 },
      { x: 4.0, y: 0.16, zLE: 0.55, zTE: 3.08, thickness: 0.042, camber: 0.004 },
      { x: 4.97, y: 0.18, zLE: 1.18, zTE: 2.88, thickness: 0.036, camber: 0.0 },
    ],
    lerx: [
      { x: 0.52, y: 0.03, zLE: -4.25, zTE: -1.65, thickness: 0.020 },
      { x: 0.76, y: 0.04, zLE: -3.35, zTE: -0.85, thickness: 0.017 },
      { x: 1.02, y: 0.05, zLE: -2.15, zTE: 0.10, thickness: 0.015 },
      { x: 1.2, y: 0.06, zLE: -1.15, zTE: 0.25, thickness: 0.014 },
    ],
    flap: { inner: 1.0, outer: 3.15, chord: 0.55, hingeZ: 2.82, y: 0.13 },
    aileron: { inner: 3.15, outer: 4.78, chord: 0.48, hingeZ: 2.7, y: 0.16 },
    htail: [
      { x: 0.42, y: 0.08, zLE: 4.68, zTE: 6.12, thickness: 0.054, camber: 0.0 },
      { x: 1.68, y: 0.04, zLE: 5.0, zTE: 6.24, thickness: 0.047, camber: 0.0 },
      { x: 2.82, y: -0.08, zLE: 5.38, zTE: 6.25, thickness: 0.038, camber: 0.0 },
    ],
    htailPivot: { x: 0.36, y: 0.08, z: 5.4 },
    fins: [
      {
        x: 0.0, y: 0.55, cant: 0, rootY: 0.55,
        sections: [
          { y: 0.55, zLE: 3.9, zTE: 6.75, thickness: 0.050 },
          { y: 1.7, zLE: 4.5, zTE: 6.9, thickness: 0.044 },
          { y: 2.85, zLE: 5.15, zTE: 6.9, thickness: 0.035 },
        ],
      },
    ],
    ventralFins: [
      { x: 0.52, y: -0.42, zLE: 4.85, zTE: 5.9, height: 0.58, cant: 0.32 },
      { x: -0.52, y: -0.42, zLE: 4.85, zTE: 5.9, height: 0.58, cant: -0.32 },
    ],
    engines: [{ x: 0.0, y: 0.05, z: 6.82, radius: 0.55 }],
    canopy: {
      // Model-scale acrylic canopy: ≈0.84 m wide × 2.68 m long × 0.38 m high.
      position: [0, 0.99, -3.3],
      scale: [0.42, 0.38, 1.34],
      frameZ: [-4.64, -1.96],
    },
    cockpitEye: [0, 1.24, -3.05],
    cockpitSeat: [0, 0.50, -2.55],
    intake: {
      // width/height here are full dimensions; the loft sections use radii.
      z: -2.62, y: -0.80, width: 1.04, height: 0.58, lipDepth: 0.11,
      sections: [
        { z: -2.62, width: 0.52, height: 0.29, y: -0.80, roundness: 0.60 },
        { z: -1.35, width: 0.57, height: 0.32, y: -0.82, roundness: 0.64 },
        { z: 0.15, width: 0.60, height: 0.33, y: -0.80, roundness: 0.68 },
        { z: 1.85, width: 0.54, height: 0.30, y: -0.68, roundness: 0.78 },
      ],
      innerSections: [
        { z: -2.60, width: 0.46, height: 0.255, y: -0.80, roundness: 0.66 },
        { z: -1.30, width: 0.46, height: 0.25, y: -0.82, roundness: 0.70 },
        { z: 0.20, width: 0.39, height: 0.215, y: -0.80, roundness: 0.72 },
        { z: 1.70, width: 0.31, height: 0.175, y: -0.68, roundness: 0.78 },
      ],
    },
    gear: {
      nose: { x: 0, y: -0.45, z: -4.55, strut: 1.18, wheel: 0.32 },
      main: [
        { x: 1.02, y: -0.48, z: 0.75, strut: 1.12, wheel: 0.37 },
        { x: -1.02, y: -0.48, z: 0.75, strut: 1.12, wheel: 0.37 },
      ],
      contactY: -2.03,
    },
    hardpoints: [
      { x: -2.35, y: -0.38, z: 1.55, type: 'aim9' },
      { x: 2.35, y: -0.38, z: 1.55, type: 'aim9' },
      { x: -3.82, y: -0.34, z: 1.45, type: 'aim9' },
      { x: 3.82, y: -0.34, z: 1.45, type: 'aim9' },
      { x: -5.02, y: 0.18, z: 1.35, type: 'aim9', rail: true },
      { x: 5.02, y: 0.18, z: 1.35, type: 'aim9', rail: true },
    ],
    cannonMuzzle: [-1.02, 0.04, -1.72],
    tailNumber: 'AF 78-0104',
    insignia: 'star',
  },

  fulcrum: {
    scheme: 'fulcrum',
    fuselage: [
      { z: -9.05, width: 0.02, height: 0.02, y: -0.02 },
      { z: -8.55, width: 0.2, height: 0.22, y: 0.02 },
      { z: -7.9, width: 0.4, height: 0.37, y: 0.07 },
      { z: -7.0, width: 0.62, height: 0.52, y: 0.12 },
      { z: -6.0, width: 0.8, height: 0.63, y: 0.18 },
      { z: -5.0, width: 0.94, height: 0.72, y: 0.22 },
      { z: -4.0, width: 1.06, height: 0.78, y: 0.24 },
      { z: -2.8, width: 1.18, height: 0.82, y: 0.22 },
      { z: -1.5, width: 1.3, height: 0.83, y: 0.16 },
      { z: -0.2, width: 1.36, height: 0.82, y: 0.12 },
      { z: 1.0, width: 1.33, height: 0.8, y: 0.08 },
      { z: 2.3, width: 1.25, height: 0.76, y: 0.05 },
      { z: 3.6, width: 1.14, height: 0.71, y: 0.03 },
      { z: 4.9, width: 1.02, height: 0.65, y: 0.02 },
      { z: 6.1, width: 0.9, height: 0.58, y: 0.02 },
      { z: 7.2, width: 0.78, height: 0.53, y: 0.02 },
      { z: 7.85, width: 0.72, height: 0.5, y: 0.02 },
    ],
    noseBreak: -7.0,
    wing: [
      { x: 1.08, y: 0.02, zLE: -0.8, zTE: 3.8, thickness: 0.052, camber: 0.004 },
      { x: 2.8, y: -0.02, zLE: 0.35, zTE: 3.55, thickness: 0.047, camber: 0.003 },
      { x: 4.35, y: -0.08, zLE: 1.25, zTE: 3.25, thickness: 0.042, camber: 0.0 },
      { x: 5.67, y: -0.16, zLE: 2.02, zTE: 2.95, thickness: 0.036, camber: 0.0 },
    ],
    lerx: [
      { x: 1.0, y: 0.04, zLE: -4.4, zTE: -1.0, thickness: 0.018 },
      { x: 1.35, y: 0.05, zLE: -3.0, zTE: 0.0, thickness: 0.016 },
      { x: 1.65, y: 0.06, zLE: -1.5, zTE: 0.4, thickness: 0.014 },
    ],
    flap: { inner: 1.5, outer: 3.9, chord: 0.6, hingeZ: 3.25, y: 0.02 },
    aileron: { inner: 3.9, outer: 5.45, chord: 0.5, hingeZ: 2.92, y: -0.02 },
    htail: [
      { x: 0.55, y: 0.06, zLE: 4.7, zTE: 6.55, thickness: 0.056, camber: 0.0 },
      { x: 1.75, y: 0.0, zLE: 5.0, zTE: 6.68, thickness: 0.048, camber: 0.0 },
      { x: 3.0, y: -0.12, zLE: 5.25, zTE: 6.6, thickness: 0.04, camber: 0.0 },
    ],
    htailPivot: { x: 0.45, y: 0.06, z: 5.65 },
    fins: [
      {
        x: 1.6, y: 0.42, cant: -0.2, rootY: 0.42,
        sections: [
          { y: 0.42, zLE: 3.7, zTE: 6.9, thickness: 0.05 },
          { y: 1.75, zLE: 4.55, zTE: 7.05, thickness: 0.044 },
          { y: 3.0, zLE: 5.4, zTE: 7.05, thickness: 0.035 },
        ],
      },
      {
        x: -1.6, y: 0.42, cant: 0.2, rootY: 0.42,
        sections: [
          { y: 0.42, zLE: 3.7, zTE: 6.9, thickness: 0.05 },
          { y: 1.75, zLE: 4.55, zTE: 7.05, thickness: 0.044 },
          { y: 3.0, zLE: 5.4, zTE: 7.05, thickness: 0.035 },
        ],
      },
    ],
    ventralFins: [
      { x: 0.7, y: -0.5, zLE: 4.7, zTE: 6.0, height: 0.55, cant: 0.3 },
      { x: -0.7, y: -0.5, zLE: 4.7, zTE: 6.0, height: 0.55, cant: -0.3 },
    ],
    engines: [
      { x: 0.62, y: 0.02, z: 7.9, radius: 0.44 },
      { x: -0.62, y: 0.02, z: 7.9, radius: 0.44 },
    ],
    canopy: {
      position: [0, 0.90, -4.15],
      scale: [0.45, 0.42, 1.42],
      frameZ: [-5.50, -2.80],
    },
    cockpitEye: [0, 1.24, -3.72],
    cockpitSeat: [0, 0.52, -3.2],
    intake: {
      z: -3.4, y: -0.58, width: 0.95, height: 0.55,
      sections: [
        { z: -3.3, width: 0.7, height: 0.48, y: -0.52 },
        { z: -1.8, width: 0.92, height: 0.55, y: -0.6 },
        { z: 0.5, width: 1.05, height: 0.58, y: -0.6 },
        { z: 2.5, width: 0.95, height: 0.52, y: -0.5 },
      ],
    },
    gear: {
      // Strut tops sit exactly on the local belly skin, not in free air.
      nose: { x: 0, y: 0.12, z: -5.25, strut: 1.78, wheel: 0.32 },
      main: [
        {
          x: 0.55, y: 0.02, z: 1.9, wheel: 0.37,
          axleX: 1.30, axleY: -1.60, apexY: -0.50,
        },
        {
          x: -0.55, y: 0.02, z: 1.9, wheel: 0.37,
          axleX: -1.30, axleY: -1.60, apexY: -0.50,
        },
      ],
      contactY: -2.03,
    },
    hardpoints: [
      { x: -2.7, y: -0.34, z: 1.9, type: 'r73' },
      { x: 2.7, y: -0.34, z: 1.9, type: 'r73' },
      { x: -4.25, y: -0.22, z: 1.75, type: 'r73' },
      { x: 4.25, y: -0.22, z: 1.75, type: 'r73' },
    ],
    cannonMuzzle: [-0.64, 0.42, -2.60],
    tailNumber: '09 RED',
    insignia: 'redstar',
  },
};

/**
 * Prototype 2 uses the same base airframe data as prototype 1, then applies the
 * reference-document layout changes that are most visible in a dogfight:
 * a 1.0 m wide / 2.3 m long / 0.6 m high canopy with two transverse bows, and a
 * clean F-16 intake (no exposed compressor face).
 */
const falconProto2 = structuredClone(JET_PROFILES.falcon);

// Prototype-2 undercarriage and gun port. These must be overridden here: the
// prototype starts as a clone of falcon and otherwise inherits the old floating
// gear positions.
falconProto2.gear = {
  // Nose gear hangs from the underside of the intake front, not from the nose.
  nose: { x: 0, y: -0.475, z: -1.85, strut: 1.175, wheel: 0.32 },
  main: [
    {
      x: 0.55, y: 0.02, z: 1.9, wheel: 0.37,
      axleX: 1.30, axleY: -1.60, apexY: -0.50,
    },
    {
      x: -0.55, y: 0.02, z: 1.9, wheel: 0.37,
      axleX: -1.30, axleY: -1.60, apexY: -0.50,
    },
  ],
  contactY: -2.03,
};
falconProto2.cannonMuzzle = [-0.64, 0.42, -2.60];
falconProto2.scheme = 'falcon';
// Body length excluding the nose pitot: z = -7.00 … +7.74 → 14.74 m.
// Fractions used below: pod front 1/6, intake lip 1/4, pod rear 1/3.
falconProto2.canopy = {
  position: [0, 0.99, -2.8715],
  scale: [0.50, 0.60, 1.5315],
  frameZ: [-4.543, -1.200],
};
falconProto2.canopyArches = false;
falconProto2.noCanopy = false;
falconProto2.bubbleCanopy = {
  halfWidth: 0.56,
  halfHeight: 0.23,
  baseScale: 0.02,
  peakFraction: 0.40,
  sillOffset: -0.10,
};
// The exposed cockpit sill follows the upper nose slope: front edge low, rear
// edge high, about 6° around the lateral axis.
falconProto2.cockpitRimY = 1.079;
falconProto2.cockpitRimTilt = -0.0642;
// Slimmer forward fuselage with the reference nose lines:
// upper surface ≈15° down toward the tip, lower surface ≈5°, slight convexity.
// The upper spine dips gently and lifts ~5° again at both ends.
falconProto2.fuselage = [
  // Upper contour is two straight lines: nose tip → point P at z=-1.2, then
  // P → fin root leading edge. P is 1.0643 m above the wing, i.e. 10/7 of the
  // 0.745 m intake-mouth thickness. Lower edge remains the wing/LEX surface.
  // B is moved up to 1/3 of the intake-mouth height below its top:
  // Y = 0.195 - (0.195 + 0.5053)/3 = -0.0384. O and D are shifted by the
  // same +0.2816 m; O=0.4656, D=0.9696 at the cockpit front.
  { z: -7.00, width: 0.02, height: 0.003, y: 0.464 },
  { z: -6.60, width: 0.10, height: 0.087, y: 0.461 },
  { z: -6.00, width: 0.22, height: 0.218, y: 0.453 },
  { z: -5.30, width: 0.38, height: 0.360, y: 0.455 },
  // Rounded lower-nose fillet: extra stations lift the old V bottom gently
  // instead of meeting at a sharp point under the cockpit front.
  { z: -4.85, width: 0.46, height: 0.451, y: 0.457 },
  { z: -4.70, width: 0.50, height: 0.482, y: 0.449 },
  { z: -4.60, width: 0.53, height: 0.505, y: 0.453 },
  { z: -4.543, width: 0.55, height: 0.516, y: 0.454 },
  { z: -4.45, width: 0.565, height: 0.519, y: 0.462 },
  { z: -4.25, width: 0.58, height: 0.513, y: 0.476 },
  { z: -3.90, width: 0.62, height: 0.514, y: 0.497 },
  { z: -3.30, width: 0.69, height: 0.507, y: 0.542 },
  { z: -3.10, width: 0.75, height: 0.504, y: 0.559 },
  { z: -2.20, width: 0.84, height: 0.496, y: 0.624 },
  // From the cockpit rear aft, body and cowl have equal thickness about the
  // engine centreline Y=0.05 (also the horizontal-tail reference line).
  // Aft of the cockpit rear the fuselage skin wraps below the cowl, so the
  // cowl becomes internal and the two surfaces read as one continuous skin.
  { z: -1.20, width: 0.94, height: 0.603, y: 0.581 },
  { z: -0.20, width: 1.02, height: 0.835, y: 0.234 },
  { z: 0.90, width: 1.06, height: 0.767, y: 0.175 },
  { z: 2.00, width: 1.06, height: 0.710, y: 0.105 },
  { z: 3.10, width: 0.98, height: 0.637, y: 0.051 },
  { z: 4.20, width: 0.90, height: 0.565, y: -0.003 },
  { z: 5.20, width: 0.78, height: 0.548, y: -0.018 },
  // Slightly wider tail skin so the stabilator root can attach to the body
  // side without a bridge crossing the engine.
  { z: 6.10, width: 0.72, height: 0.537, y: -0.017 },
  { z: 6.75, width: 0.62, height: 0.521, y: -0.021 },
];
// Smooth the cross-section corners (roundness 1 = ellipse) and remove the old
// dorsal hump; the upper line now comes from the fuselage loft.
falconProto2.fuselage = falconProto2.fuselage.map((section) => ({
  ...section, roundness: 1.0,
}));
falconProto2.spine = null;
// Main wing, from the reference layout: root chord ≈5.0 m, 40° leading-edge
// sweep, flat-cut tip, tip chord ≈0.8 m, trailing edge almost straight.
falconProto2.wing = [
  // Straight-cut trailing edge: every station ends at Z=3.95, giving the two
  // flap pairs a clean hinge line with no wing skin behind them.
  { x: 0.55, y: 0.12, zLE: -0.59, zTE: 3.95, thickness: 0.055, camber: 0.006 },
  { x: 2.8, y: 0.12, zLE: 1.30, zTE: 3.95, thickness: 0.048, camber: 0.005 },
  { x: 4.0, y: 0.12, zLE: 2.31, zTE: 3.95, thickness: 0.042, camber: 0.004 },
  { x: 4.97, y: 0.12, zLE: 3.12, zTE: 3.95, thickness: 0.036, camber: 0.0 },
];
falconProto2.flapHingeZ = 3.95;
falconProto2.flapY = 0.12;
falconProto2.flapPanels = [
  // Flush with both wing ends: root X=0.55, tip X=4.97, split at 2.76.
  { inner: 0.55, outer: 2.76, chord: 0.52, thickness: 0.050, taper: 0.90, role: 'flap' },
  { inner: 2.79, outer: 4.97, chord: 0.52, thickness: 0.046, taper: 0.86, role: 'aileron' },
];
falconProto2.wingInsigniaZ = 2.70;
// One triangular strake per side, running from the cockpit front edge to the
// wing leading-edge root. The included angle at the wing junction is ≈145°.
falconProto2.lerx = [
  // The inboard root has a full-length chord buried deep in the fuselage
  // (Z=-4.543…0.20), so there is no station where a gap can open between the
  // LEX and the body. The outboard tip is likewise buried in the wing.
  // The LEX trailing edge is placed exactly on the wing leading edge at each
  // span station, so the two surfaces share a continuous join:
  // wing LE(x=0.50)=-0.59, LE(1.10)=-0.13, LE(1.80)=+0.46.
  // Root stays on the fuselage centreline, buried well inside the body, so it
  // cannot poke through the nose as a pair of side bulges in front view.
  { x: 0.00, y: 0.30, zLE: -4.543, zTE: -1.20, thickness: 0.120 },
  { x: 0.50, y: 0.35, zLE: -3.20, zTE: -0.37, thickness: 0.080 },
  { x: 1.10, y: 0.25, zLE: -1.60, zTE: 0.09, thickness: 0.050 },
  { x: 1.80, y: 0.12, zLE: 0.00, zTE: 0.68, thickness: 0.040 },
];
falconProto2.hardpoints = [
  { x: -2.35, y: -0.38, z: 2.90, type: 'aim120' },
  { x: 2.35, y: -0.38, z: 2.90, type: 'aim120' },
  { x: -3.82, y: -0.34, z: 3.30, type: 'aim120' },
  { x: 3.82, y: -0.34, z: 3.30, type: 'aim120' },
  { x: -5.02, y: 0.18, z: 3.55, type: 'aim9', rail: true },
  { x: 5.02, y: 0.18, z: 3.55, type: 'aim9', rail: true },
  { x: 0, y: -0.74, z: 2.70, type: 'aim120' },
];

// All-moving stabilators: moved aft so they sit behind the wing trailing edge
// instead of being buried under it. Root chord ≈2.4 m, flat tips.
// Horizontal tail trailing edge is flush with the engine/nozzle rear face
// (z = 7.74: engine station 6.82 + 0.92 petal length).
falconProto2.htail = [
  // Root starts outboard of the engine radius (0.55) with a 0.09 m gap.
  { x: 0.64, y: 0.08, zLE: 5.30, zTE: 7.74, thickness: 0.054, camber: 0.0 },
  { x: 1.68, y: 0.04, zLE: 6.30, zTE: 7.74, thickness: 0.047, camber: 0.0 },
  { x: 2.82, y: -0.08, zLE: 7.14, zTE: 7.74, thickness: 0.038, camber: 0.0 },
];
falconProto2.htailPivot = { x: 0.56, y: 0.08, z: 5.90 };

// The fin is mounted on the square tail beam, not on the round fuselage.
// Its trailing edge stops a short distance before the beam/engine rear face.
falconProto2.tailBeam = {
  // Raised clear of the engine top (radius 0.55, centre Y=0.05) while the
  // vertical fin root still ties it down to the fuselage.
  startZ: 4.30, endZ: 7.74, width: 0.28, height: 0.18, y: 0.70,
};
falconProto2.fins = [{
  x: 0.0, y: 0.55, cant: 0, rootY: 0.55,
  sections: [
    { y: 0.55, zLE: 4.30, zTE: 7.30, thickness: 0.050 },
    { y: 1.70, zLE: 5.55, zTE: 7.30, thickness: 0.044 },
    { y: 3.00, zLE: 6.50, zTE: 7.30, thickness: 0.035 },
  ],
}];
// Ventral fins: trailing edge close to the main-wing trailing edge (z=4.45),
// but deliberately not flush with it.
falconProto2.ventralFins = [
  { x: 0.52, y: -0.42, zLE: 3.40, zTE: 4.62, height: 0.58, cant: 0.32 },
  { x: -0.52, y: -0.42, zLE: 3.40, zTE: 4.62, height: 0.58, cant: -0.32 },
];
falconProto2.intake = {
  ...falconProto2.intake,
  // Slightly larger mouth to balance the slimmer nose; the cowl progressively
  // loses thickness until it is flush with the belly at the rear station.
  // Intake lip at 2/3 of the cockpit length (z=-2.906). Under the main wing the
  // cowl widens to become the whole lower fuselage, then narrows to the engine.
  z: -2.323,
  width: 0.96,
  height: 0.54,
  noFan: false,
  // Small vertical overlap so the cowl top penetrates the belly instead of
  // leaving a coplanar weld line. Thickness itself is unchanged.
  seamOverlap: 0.030,
  // Elliptical cross-sections (roundness 1), with closely spaced stations so
  // the lip → duct → engine transition has no visible kink.
  sections: [
    // Exposed cowl width follows the local fuselage width exactly:
    // Z=-2.323→0.83, -2.10→0.84, -1.50→0.88, -1.20→0.94 half-width.
    { z: -2.323, width: 0.830, height: 0.3725, y: -0.1775, roundness: 1.0 },
    { z: -2.10, width: 0.840, height: 0.368, y: -0.179, roundness: 1.0 },
    { z: -1.50, width: 0.880, height: 0.3525, y: -0.1875, roundness: 1.0 },
    { z: -1.20, width: 0.860, height: 0.346, y: -0.189, roundness: 1.0 },
    { z: -0.50, width: 0.880, height: 0.341, y: -0.189, roundness: 1.0 },
    { z: 0.50, width: 0.900, height: 0.335, y: -0.190, roundness: 1.0 },
    { z: 1.50, width: 0.920, height: 0.326, y: -0.190, roundness: 1.0 },
    { z: 2.50, width: 0.900, height: 0.315, y: -0.190, roundness: 1.0 },
    { z: 3.50, width: 0.840, height: 0.310, y: -0.188, roundness: 1.0 },
    { z: 4.50, width: 0.740, height: 0.305, y: -0.185, roundness: 1.0 },
    { z: 5.20, width: 0.640, height: 0.307, y: -0.188, roundness: 1.0 },
    { z: 5.60, width: 0.580, height: 0.309, y: -0.189, roundness: 1.0 },
    { z: 5.82, width: 0.520, height: 0.310, y: -0.190, roundness: 1.0 },
  ],
  innerSections: [
    { z: -2.303, width: 0.750, height: 0.3325, y: -0.1775, roundness: 1.0 },
    { z: -2.10, width: 0.760, height: 0.328, y: -0.179, roundness: 1.0 },
    { z: -1.50, width: 0.800, height: 0.3125, y: -0.1875, roundness: 1.0 },
    { z: -1.20, width: 0.800, height: 0.306, y: -0.189, roundness: 1.0 },
    { z: -0.50, width: 0.820, height: 0.301, y: -0.189, roundness: 1.0 },
    { z: 0.50, width: 0.840, height: 0.295, y: -0.190, roundness: 1.0 },
    { z: 1.50, width: 0.860, height: 0.286, y: -0.190, roundness: 1.0 },
    { z: 2.50, width: 0.840, height: 0.275, y: -0.190, roundness: 1.0 },
    { z: 3.50, width: 0.780, height: 0.270, y: -0.188, roundness: 1.0 },
    { z: 4.50, width: 0.680, height: 0.265, y: -0.185, roundness: 1.0 },
    { z: 5.20, width: 0.580, height: 0.267, y: -0.188, roundness: 1.0 },
    { z: 5.60, width: 0.520, height: 0.269, y: -0.189, roundness: 1.0 },
    { z: 5.82, width: 0.460, height: 0.270, y: -0.190, roundness: 1.0 },
  ],
};
// Final slimming pass: 7% narrower in plan view, without touching heights or
// intake thickness. Widths stay matched between fuselage and exposed cowl.
// 7% initial slimming × another 5% = 0.8835 overall (≈11.65% narrower).
const PLANFORM_SCALE = 0.8835;
for (const section of falconProto2.fuselage) section.width *= PLANFORM_SCALE;
for (const section of falconProto2.intake.sections) section.width *= PLANFORM_SCALE;
for (const section of falconProto2.intake.innerSections) section.width *= PLANFORM_SCALE;
JET_PROFILES.falconProto2 = falconProto2;
