import {F16_STATIONS} from './f16Stations.js';
import {createJ16Config} from './j16.js';
import {createJ10CConfig} from './j10c.js';
import {F16_WIKI} from './f16Wiki.js';
/**
 * Aircraft data sheets. Everything the simulation needs is data, not code:
 * mass, geometry, aero coefficients, propulsion, limits and armament.
 *
 * Performance targets are cross-checked against the War Thunder Wiki F-16A
 * entry (F100-PW-220, 2,156 km/h at 10,973 m, ~305 m/s best climb, 19.5 s turn)
 * and public F-16A Block 10 figures (≈270°/s roll class). Aero coefficients are
 * an engineering reconstruction, not Gaijin's proprietary flight model.
 */
import { DEG } from '../sim/math.js';

const f16Common = {
  id: 'proto1',
  name: '测试原型机1型',
  shortName: '原型1',
  nation: 'TEST',
  role: '飞行测试原型机',
  visual: {
    length: 15.06,
    height: 4.88,
    wingspan: 9.96,
    scheme: 'falcon',
    callsign: 'PROTO 1-1',
  },
  mass: {
    // Airframe, equipment and pilot, excluding the engine. The installed
    // F100-PW-220 is accounted for separately below so engine mass is explicit.
    empty: 5922,
    engine: 1778,    // F100-PW-220 installed engine mass
    fuel: 2400,      // internal fuel, reduced for mission length
    ammo: 180,       // 511 x 20 mm + feed
    stores: 620,     // six AIM-9L + pylons
  },
  geometry: {
    wingArea: 27.87, // m^2
    wingspan: 9.96,
    chord: 3.45,     // mean aerodynamic chord
    aspectRatio: 3.56,
  },
  inertia: {
    roll: 15000,     // kg m^2
    pitch: 95000,
    yaw: 112000,
  },
  limits: {
    gPositive: 9.0,
    gNegative: -3.0,
    maxIas: 1480,      // km/h, above this the airframe is overstressed
    maxMach: 2.05,
    gearIas: 400,      // km/h gear doors / struts (extension limit)
    flapIas: 600,      // km/h takeoff/landing flap structural limit
    brakeIas: 650,
    alphaLimit: 25.5 * DEG,
    alphaNegative: -16 * DEG,
    structuralG: 10.8,
  },
  aero: {
    // Symmetric-ish fighter wing with a small cambered section. Values are
    // degrees / coefficient and follow a smoothed wind-tunnel-like stall.
    clTable: [
      [-40, -0.45], [-30, -0.75], [-24, -1.02], [-18, -1.08],
      [-12, -0.82], [-6, -0.42], [0, 0.04], [4, 0.31],
      [8, 0.59], [12, 0.88], [16, 1.13], [20, 1.34],
      [24, 1.46], [28, 1.38], [32, 1.13], [40, 0.66], [55, 0.30],
    ],
    clMax: 1.46,
    // Takeoff flap lift calibrated as for the J-16 / J-10C: the hands-off
    // afterburner takeoff run matches the War Thunder wiki figure (F-16A and
    // F-16CM: 850 m), ~434 km/h liftoff; rotating from 280 km/h lifts off at
    // ~330 km/h in ~475 m. The FBW holds 1 g, so flap lift shows as a nose drop:
    // this keeps it to ~2-3° (it was ~10° at 1.72, 272 m / 253 km/h liftoff).
    clFlap: 0.32,
    // Full landing flap detent trades some lift for a much higher descent rate;
    // otherwise the aircraft floats and cannot be landed.
    clFlapLanding: 0.20,
    // Authored flap moments, compensated by elevator trim rather than extra G.
    flapPitchMoment: { takeoff: -0.0108, landing: -0.026 },
    cd0: 0.0205,
    storesCd: 0.0035,
    inducedK: 0.112,
    oswald: 0.80,
    machDragPeak: 0.032,
    machDragCenter: 1.02,
    machDragWidth: 0.270,
    supersonicDrag: 0.0060,
    gearCd: 0.018,
    // Takeoff/landing flap profile drag; WT does not publish a coefficient,
    // this is the high-drag flap setting rather than a clean-wing value.
    flapCd: 0.055,
    brakeCd: 0.052,
    // Force coefficients. Body axes: x forward, y right, z down.
    cyBeta: -0.92,
    cyRudder: 0.13,
    clBeta: -0.085,
    clp: -0.46,
    clr: 0.028,
    clAileron: 0.128,
    clRudder: 0.012,
    cm0: 0.0,
    cmAlpha: -0.48,
    cmq: -12.0,
    cmElevator: 0.55,
    cmFlap: -0.018,
    cmGear: 0.006,
    cmBrake: -0.004,
    cnBeta: 0.12,
    cnr: -0.13,
    cnRudder: 0.075,
    cnp: 0.035,
    cnAileron: -0.009,
    elevatorMax: 0.38,
    aileronMax: 0.40,
    rudderMax: 0.35,
    elevatorRate: 1.6,
    aileronRate: 3.0,
    rudderRate: 1.5,
    stallBuffet: 0.20,
    // Mach-dependent lift loss (transonic separation / shock stall).
    machLiftLoss: 0.20,
  },
  engine: {
    name: 'F100-PW-220',
    // F100-PW-220 installed thrust, War Thunder F-16A historical data:
    // 64.9 kN military and 105.7 kN with afterburner, dry engine mass 1778 kg.
    dryThrust: 64900,       // N
    afterburnerThrust: 105700,
    weightKg: 1778,
    idleFraction: 0.035,
    spoolUp: 1.8,           // seconds to full travel
    spoolDown: 2.6,
    abSpool: 0.65,
    densityExponent: 0.82,
    ramFactor: 0.12,
    highMachLoss: 0.09,
    fuelFlowDry: 0.82,      // kg/s at military
    fuelFlowAB: 2.65,       // kg/s at full afterburner
    idleFlow: 0.08,
    nozzleArea: 0.62,
  },
  systems: {
    gearTime: 4.2,
    flapTime: 3.0,
    brakeTime: 1.4,
    trimRate: 0.12,
    takeoffPitchDeg: 2.5,
    // Procedural F-16 tyres sit 1.97 m below the model origin (measured, gear down).
    contactHeight: 1.97,
    mainGearZ: 0.75,
    maxFuel: 2400,
    // F-16C Block 50 countermeasure capacity. A composite AMRAAM pylon adds
    // 30 more chaff cartridges per station.
    flareCount: 60,
    chaffCount: 60,
  },
  armament: {
    cannon: {
      name: 'M61A1 Vulcan',
      caliber: 20,
      ammo: 511,
      rate: 6000,            // rounds / minute
      spinUpTime: 0.55,      // M61 motor spin-up before the first round
      muzzleVelocity: 1030,
      dispersion: 0.0028,    // radians
      damage: 7,
      tracerEvery: 3,
      mass: 0.10,
      drag: 0.000045,
      life: 4.0,
      muzzle: [-1.02, 0.04, -1.72],
      launchOffsets: [
        [-3.8, -0.34, 1.45], [3.8, -0.34, 1.45],
        [-2.35, -0.38, 1.55], [2.35, -0.38, 1.55],
        [-5.02, 0.18, 1.35], [5.02, 0.18, 1.35],
      ],
    },
    missiles: {
      name: 'AIM-9L Sidewinder',
      count: 6,
      mass: 85.3,
      warhead: 9.4,
      damage: 120,
      lockAngle: 55 * DEG,
      lockRange: 7500,
      maxRange: 11000,
      boostTime: 2.4,
      boostAccel: 190,
      maxG: 32,
      proximity: 9,
      drag: 0.00009,
    },
    flare: {
      count: 60,
      burnTime: 4.2,
      ejectSpeed: 22,
    },
  },
};

export const F16A_PROTO1 = f16Common;
// Backwards-compatible name used by the flight tests and docs.
export const F16A = f16Common;

/**
 * Second test airframe. It keeps prototype 1's flight model and systems but
 * uses the reference-document F-16 layout for the visible airframe: a wider /
 * shorter bubble canopy with only two transverse bows and a clean intake duct.
 * Paint is intentionally unchanged until the livery pass.
 */
export const F16A_PROTO2 = {
  ...structuredClone(f16Common),
  id: 'f16-deepseek',
  name: 'F-16 DeepSeek',
  shortName: 'F-16DS',
  systems: {...f16Common.systems,mainGearZ:1.90},
  visual: {
    ...f16Common.visual,
    scheme: 'falconProto2',
    callsign: 'PROTO 2-1',
  },
  armament: {
    ...structuredClone(f16Common.armament),
    missileLoadout: [
      {
        type: 'aim120c', name: 'AIM-120C-7 AMRAAM', count: 5,
        mass: 152, warhead: 18, damage: 170,
        lockAngle: 30 * DEG, lockRange: 55000, maxRange: 60000,
        boostTime: 4.2, boostAccel: 185,
        sustainTime: 2.6, sustainAccel: 42, maxG: 40,
        proximity: 12, drag: 0.000065,
        selfDestructSpeed: 150, energyFloor: 0.10,
        irSeeker: false, radar: true,
        guidance: 'activeRadar', datalink: true,
        activeRange: 18000, seekerRange: 22000,
        seekerAngle: 50 * DEG,
      },
      {
        ...f16Common.armament.missiles,
        type: 'aim9m', name: 'AIM-9M Sidewinder', count: 2,
        lockAngle: 60 * DEG, lockRange: 8500, maxRange: 12000,
      },
    ],
    cannon: {
      ...f16Common.armament.cannon,
      launchOffsets: [
        [-2.35, -0.38, 2.90], [2.35, -0.38, 2.90],
        [-3.82, -0.34, 3.30], [3.82, -0.34, 3.30],
        [-5.02, 0.18, 3.55], [5.02, 0.18, 3.55],
        [0, -0.74, 2.70],
      ],
    },
  },
};

/**
 * F-16CM Block 52: the CAD-skinned Viper. Wiki reference facts describe the
 * closest WT unit (Block 50); they do not retune the inherited flight model.
 */
export const F16CM_BLOCK52 = {
  ...structuredClone(F16A_PROTO2),
  id: 'f16cm-block52',
  name: 'F-16CM Block 52',
  shortName: 'F-16CM',
  rwrCode: 'F16',
  rwrType: 'F16',
  avionicsSource: 'f16cm-block52',
  wiki: F16_WIKI,
  control: {rollRate: 4.9}, // Explicit shared default, rad/s; no flight-law change.
  performanceTargets: {...F16_WIKI.aircraft,wingArea:F16A_PROTO2.geometry.wingArea},
  estimates: [
    'Block 50 wiki facts are reference targets, not measured Block 52 performance',
    'retained prototype mass/fuel, engine, limits and 511-round cannon configuration; see assets/models/f16/README.md',
    'aerodynamic curves, inertia, actuator rates and 4.9 rad/s roll command',
    'engine spool, fuel-flow and altitude lapse coefficients',
    'cannon velocity/dispersion/game damage and weapon motor/drag/blast coefficients',
  ],
  // Wiki limits (Block 50 page, sources/wiki/f16.html): service ceiling 15,240 m and
  // takeoff-flap limit 470 km/h. flapIas (landing flaps) keeps the inherited 600 km/h;
  // the wiki lists 463 km/h for landing flaps.
  limits: {...F16A_PROTO2.limits, ceiling: F16_WIKI.aircraft.ceiling, flapTakeoffIas: F16_WIKI.aircraft.flapTakeoffIas},
  // abThreshold 1: afterburner only beyond full military power (same as J-16 / J-10C).
  engine: {...F16A_PROTO2.engine, abThreshold: 1},
  // CAD airframe: tyres 2.03 m below the origin, the physics default 2.04.
  // maxGroundPitchDeg: nozzle strikes at 10.2° (tools/measure-tail-strike.mjs).
  systems: {...F16A_PROTO2.systems,mainGearZ:1.50,contactHeight:2.04,canopyTime:5.0,maxGroundPitchDeg:10},
  visual: {
    ...F16A_PROTO2.visual,
    callsign: 'VIPER 5-2',
    cadModel: 'assets/models/f16/f16_flight.glb',
    // F-16 sound pack (engine, afterburner, cockpit, M61 loop); see audio/README.md.
    audioManifest: 'audio/pack.json',
    gunMode: 'loop',
    // Hangar/menu texts; specs: wing loading, thrust/weight, G limits, max Mach, engine.
    hangar: {title: 'F-16CM BLOCK 52', code: 'F-16CM BLOCK 52', loadoutTag: 'F-16 / LOADOUT', menuTag: 'F-16CM BLOCK 52 // VIPER',
      name: ['F-16CM', 'BLOCK 52'], note: '美国 · 单发轻型多用途战斗机', specs: ['391 kg/m²', '1.18', '+9.0 G', '2.05', 'F100-PW-220']},
    // Selectable liveries [id, label]; ids are the ones the aircraft's Jet understands.
    paints: {default: 'service', options: [['service', '基础外观'], ['jersey-jerk', 'Jersey Jerk']]},
  },
  // Default combat load: four AMRAAMs and two Sidewinders.
  armament: {
    ...structuredClone(F16A_PROTO2.armament),
    missileLoadout: [
      { ...structuredClone(F16A_PROTO2.armament.missileLoadout[0]), count: 4 },
      { ...structuredClone(F16A_PROTO2.armament.missileLoadout[1]), count: 2 },
      {
        type: 'aim7m', name: 'AIM-7M Sparrow', count: 0,
        mass: 231, warhead: 30, damage: 150,
        lockAngle: 25 * DEG, lockRange: 35000, maxRange: 45000,
        boostTime: 3.2, boostAccel: 150,
        sustainTime: 2.0, sustainAccel: 30, maxG: 25,
        proximity: 8, selfDestructSpeed: 150, energyFloor: 0.09,
        drag: 0.00012, irSeeker: false, radar: true, guidance: 'sarh',
        datalink: false, activeRange: 0, seekerRange: 0,
        seekerAngle: 0, chaffSusceptibility: 0.5,
      },
    ],
    cannon: {
      ...structuredClone(F16A_PROTO2.armament.cannon),
      trackAmmoMass: true,
      // M61A1 belts from the wiki (K cycles them, same as J-16 / J-10C). Penetration:
      // AP-I / API-T use the default-belt row, SAPHEI the armored-belt row. Per-shell
      // damage is authored around the existing 7 per round; tracers are the API-T rounds.
      belts: F16_WIKI.aircraft.cannonBelts,
      shellDamage: {'HEF-I': 8, 'API-T': 7, 'AP-I': 6, 'SAPHEI': 8},
      tracerShells: ['API-T'],
      penetration: {apShells: ['AP-I', 'API-T'], distance: F16_WIKI.aircraft.beltPenetration.distance,
        apT: F16_WIKI.aircraft.beltPenetration.mm.default, aphe: F16_WIKI.aircraft.beltPenetration.mm.armored},
      muzzle: [-.562,.25,-1.82],
      launchOffsets: F16_STATIONS.filter(s=>['lt','lo','li','ri','ro','rt'].includes(s.id)).map(s=>[s.x,s.y+.55,s.z]),
    },
  },
};

/**
 * A credible late-1980s opponent: twin-engine, heavier, big wing and very
 * strong thrust, slightly inferior roll rate. Shares the same open flight
 * model, so every dogfight obeys the same physics as the player.
 */
export const MIG29 = {
  ...structuredClone(f16Common),
  id: 'mig29',
  name: 'MiG-29A Fulcrum',
  shortName: 'MiG-29A',
  nation: 'USSR',
  role: '前线战斗机',
  rwrType: 'M29',
  rwrCode: 'M29',
  rwrEmitter: 'N019',
  visual: {
    length: 17.32,
    height: 4.73,
    wingspan: 11.36,
    scheme: 'fulcrum',
    callsign: 'BANDIT',
  },
  mass: {
    empty: 11200,
    fuel: 2200,
    ammo: 150,
    stores: 480,
  },
  geometry: {
    wingArea: 38.0,
    wingspan: 11.36,
    chord: 4.1,
    aspectRatio: 3.4,
  },
  inertia: {
    roll: 22000,
    pitch: 135000,
    yaw: 155000,
  },
  limits: {
    ...f16Common.limits,
    gPositive: 9.0,
    maxIas: 1500,
    alphaLimit: 28 * DEG,
  },
  aero: {
    ...f16Common.aero,
    clTable: f16Common.aero.clTable.map(([d, v]) => [d, v * 1.02]),
    clFlap: 0.80,
    flapPitchMoment: {takeoff:-0.010,landing:-0.018},
    cd0: 0.0225,
    inducedK: 0.091,
    clBeta: -0.075,
    clp: -0.38,
    clAileron: 0.092,
    cmAlpha: -0.52,
    cmElevator: 0.58,
    cnBeta: 0.14,
    cnRudder: 0.080,
    aileronMax: 0.33,
  },
  engine: {
    ...f16Common.engine,
    name: 'RD-33',
    dryThrust: 100000,         // two engines
    afterburnerThrust: 162800,
    fuelFlowDry: 1.05,
    fuelFlowAB: 3.6,
  },
  systems: {
    ...f16Common.systems,
    contactHeight: 2.04,
    maxFuel: 2200,
    flareCount: 24,
    chaffCount: 24,
  },
  armament: {
    ...structuredClone(f16Common.armament),
    missiles: {
      ...f16Common.armament.missiles,
      type: 'r27r',
      name: 'R-27R',
      count: 1,
      mass: 253,
      damage: 58,
      lockAngle: 45 * DEG,
      lockRange: 28000,
      maxRange: 32000,
      // Deliberately a long-range but poor-quality radar shot: weak motor,
      // low turn limit and high drag make it easy to outmaneuver.
      boostTime: 2.2,
      boostAccel: 72,
      sustainTime: 0.8,
      sustainAccel: 12,
      maxG: 8,
      proximity: 10,
      selfDestructSpeed: 145, energyFloor: 0.09,
      drag: 0.00024,
      irSeeker: false,
      radar: true,
      guidance: 'activeRadar',
      datalink: true,
      activeRange: 9000,
      seekerRange: 13000,
      seekerAngle: 32 * DEG,
      chaffSusceptibility: 1.0,
    },
  },
};

export const J16 = createJ16Config(F16CM_BLOCK52);
export const J10C = createJ10CConfig(F16CM_BLOCK52);
export const AIRCRAFT_TYPES = {
  j16:J16,
  j10c:J10C,
  'f16cm-block52': F16CM_BLOCK52,
  mig29: MIG29,
};
// F16A_PROTO1 (测试原型机1型) and F16A_PROTO2 (F-16 DeepSeek) are retired from
// the game; they stay as the data base of F-16CM / J-16 / J-10C and the flight
// tests. Their airframes are archived in assets/models/f16-procedural/.
