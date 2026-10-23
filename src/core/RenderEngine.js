import * as THREE from '../../vendor/three.module.js';

/**
 * Thin renderer wrapper: owns the WebGL context, camera, resize handling,
 * quality presets and the frame clock. Gameplay and world building stay out.
 */
export class RenderEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    // A tighter depth range keeps the distant ocean/terrain from stippling at
    // high altitude, where a 0.4/90000 ratio loses most of its depth precision.
    this.camera = new THREE.PerspectiveCamera(
      62, window.innerWidth / window.innerHeight, 0.6, 75000);
    this.camera.position.set(0, 100, 0);
    this.clock = new THREE.Clock();
    this.quality = 'high';
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
  }

  setQuality(quality) {
    this.quality = quality;
    const presets = {
      high: { ratio: 1.75, shadows: true, shadowSize: 2048 },
      balanced: { ratio: 1.25, shadows: true, shadowSize: 1024 },
      performance: { ratio: 1.0, shadows: false, shadowSize: 512 },
    };
    const p = presets[quality] || presets.high;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, p.ratio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = p.shadows;
    if (this.light) {
      this.light.castShadow = p.shadows;
      this.light.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      if (this.light.shadow.map) {
        this.light.shadow.map.dispose();
        this.light.shadow.map = null;
      }
    }
    this.resize();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  get delta() {
    return Math.min(this.clock.getDelta(), 0.05);
  }
}
