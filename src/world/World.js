import * as THREE from '../../vendor/three.module.js';
import { Terrain } from './Terrain.js';
import { Sky } from './Sky.js';
import { Ocean } from './Ocean.js';
import { CloudField } from './Clouds.js';
import { Airbase } from './Airbase.js';
import { createMinimapCanvas } from './minimap.js';
import {
  terrainHeight, terrainSlope, groundHeight, isOnRunway, isOnAirbase,
  getSpawnPoints, BOUNDARY_RADIUS, AIRBASE, SEA_LEVEL, MAP_SIZE,
} from './terrainData.js';

/**
 * Owns the island, atmosphere and lighting. The Game asks this class for
 * ground height and runway state; nothing in here knows about aircraft.
 */
export class World {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.scene.fog = new THREE.FogExp2(0x9aafbd, 0.0000165);
    this.scene.fog.color.convertSRGBToLinear();

    this.sky = new Sky(renderer, scene);
    this.terrain = new Terrain();
    this.ocean = new Ocean();
    this.airbaseScene = new Airbase();
    this.clouds = new CloudField({ fogColor: '#9aafbd' });
    this.clouds.material.uniforms.uFogColor.value.convertSRGBToLinear();
    this.scene.add(this.sky.group, this.terrain.group, this.ocean.group,
      this.airbaseScene.group, this.clouds.group);
    this.mapCanvas = createMinimapCanvas(512);
    this.mapSize = MAP_SIZE;

    this.time = 0;
    this.spawns = getSpawnPoints();
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.sky.update(camera.position, focus || camera.position);
    this.ocean.update(this.time);
    this.clouds.update(this.time);
  }

  groundHeight(x, z) {
    return groundHeight(x, z);
  }

  terrainHeight(x, z) {
    return terrainHeight(x, z);
  }

  heightAt(x, z) {
    return terrainHeight(x, z);
  }

  slopeAt(x, z) {
    return terrainSlope(x, z);
  }

  isRunway(x, z, margin = 0) {
    return isOnRunway(x, z, margin);
  }

  isAirbase(x, z) {
    return isOnAirbase(x, z);
  }

  get bounds() {
    return BOUNDARY_RADIUS;
  }

  get airbase() {
    return AIRBASE;
  }

  get seaLevel() {
    return SEA_LEVEL;
  }
}
