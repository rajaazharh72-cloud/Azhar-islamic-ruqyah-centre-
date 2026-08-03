/**
 * hero.js — "Shifa" (شِفَاء) WebGL hero scene.
 *
 * A field of golden particles drifts as a slow rotating cloud, then eases into
 * the Arabic word شِفَاء (healing). Behind it, soft volumetric god-rays fall from
 * the upper-left; in front, sparse dust motes drift like dust in mosque light.
 *
 * Usage:
 *   import { initHero } from './hero.js';
 *   const hero = initHero(canvasEl, { getScrollProgress: () => 0 });
 *   // later: hero.destroy();
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/* ------------------------------------------------------------------ *
 * Palette & constants
 * ------------------------------------------------------------------ */
const COLOR_BG = 0x0a0e1a; // midnight indigo
const GOLD_DEEP = new THREE.Color(0xc9a227);
const GOLD_LIGHT = new THREE.Color(0xe8c766);
const IVORY = new THREE.Color(0xf5efe0);
const EMERALD = new THREE.Color(0x0f3d33);

const WORD = 'شِفَاء';
const ASSEMBLE_DURATION = 3.0; // seconds
const ASSEMBLE_DELAY = 0.35;   // a beat of drifting chaos before the word gathers
const CAM_Z = 13;              // resting camera distance; scroll pushes it back
// The hero headline is anchored to the lower third, so the word is lifted into
// the cleared band between the bismillah and the title rather than sitting
// dead-centre behind the text. The band is deliberately kept free of any other
// element so the calligraphy can assemble and be read.
const WORD_Y_OFFSET = 1.9;
const WORD_OPACITY = 0.95;

/* ------------------------------------------------------------------ *
 * Shaders
 * ------------------------------------------------------------------ */

/**
 * Particles morph entirely on the GPU: each vertex carries both its scattered
 * origin and its final letterform position, and `uProgress` blends between them.
 * That keeps the CPU out of the per-frame loop for ~7k points.
 */
const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;    // 0 = scattered cloud, 1 = assembled word
  uniform float uPixelRatio;
  uniform float uSizeScale;
  uniform float uIdle;        // amplitude of the post-assembly idle drift

  attribute vec3 aScatter;    // drifting cloud position
  attribute vec3 aTarget;     // sampled letterform position
  attribute float aSeed;      // 0..1 per-particle randomness
  attribute float aSize;
  attribute float aTint;      // 0 = deep gold, 1 = ivory

  varying float vTint;
  varying float vTwinkle;

  void main() {
    float seedAngle = aSeed * 6.28318;

    // --- scattered state: the whole cloud turns slowly, and stops turning as
    // the word resolves so the letterforms are not smeared by rotation.
    float spin = uTime * 0.075 * (1.0 - uProgress);
    float c = cos(spin), s = sin(spin);
    vec3 cloud = vec3(
      aScatter.x * c - aScatter.z * s,
      aScatter.y + sin(uTime * 0.35 + seedAngle) * 0.22,
      aScatter.x * s + aScatter.z * c
    );

    vec3 pos = mix(cloud, aTarget, uProgress);

    // --- idle breathing once assembled, so the word never looks frozen.
    float breath = uProgress * uIdle;
    pos.x += sin(uTime * 0.60 + seedAngle) * breath;
    pos.y += cos(uTime * 0.50 + seedAngle * 1.7) * breath;
    pos.z += sin(uTime * 0.40 + seedAngle * 2.3) * breath * 1.6;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Size attenuation by depth. The 7.0 is tuned against CAM_Z so a particle
    // lands at roughly 2–5 CSS pixels — glowing dust, not blobs.
    gl_PointSize = aSize * uSizeScale * uPixelRatio * (7.0 / max(-mv.z, 0.6));

    vTint = aTint;
    // Two detuned sines give a non-repeating shimmer without extra uniforms.
    vTwinkle = 0.62
      + 0.24 * sin(uTime * 1.9 + seedAngle * 5.0)
      + 0.14 * sin(uTime * 0.7 + seedAngle * 11.0);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uGoldDeep;
  uniform vec3 uGoldLight;
  uniform vec3 uIvory;
  uniform float uOpacity;

  varying float vTint;
  varying float vTwinkle;

  void main() {
    // Soft round sprite built from the point coord — no texture fetch.
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d) * 4.0;              // 0 at centre, 1 at the inscribed edge
    if (r > 1.0) discard;
    float core = pow(1.0 - r, 2.2);         // tight bright centre
    float halo = pow(1.0 - r, 0.75) * 0.35; // wide soft bloom
    float alpha = (core + halo) * uOpacity * vTwinkle;

    vec3 warm = mix(uGoldDeep, uGoldLight, smoothstep(0.0, 0.6, vTint));
    vec3 color = mix(warm, uIvory, smoothstep(0.6, 1.0, vTint));

    gl_FragColor = vec4(color * (0.75 + core * 0.6), alpha);
  }
`;

/**
 * Fullscreen-quad god rays. Drawn first with depth off, so it acts as a cheap
 * painted backdrop rather than a post-processing pass.
 */
const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Ignore the camera entirely: this quad already spans clip space.
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform float uAspect;
  uniform float uIntensity;
  uniform float uDrift;       // scroll/pointer parallax offset
  uniform vec3 uGold;
  uniform vec3 uEmerald;

  varying vec2 vUv;

  void main() {
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);

    // Rotate the sampling axis so the bands read as light angled down-right
    // from an unseen window in the upper-left.
    const float A = -0.66;
    float ca = cos(A), sa = sin(A);
    vec2 r = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    // 4 gaussian bands, each breathing at its own very slow rate.
    float beams = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float centre = -0.42 + fi * 0.26
        + sin(uTime * 0.045 + fi * 2.1) * 0.05
        + uDrift * (0.5 + fi * 0.12);
      float width = 0.055 + fi * 0.022 + sin(uTime * 0.03 + fi) * 0.008;
      float k = (r.x - centre) / width;
      beams += exp(-k * k) * (1.0 - fi * 0.16);
    }

    // Fade with distance from the light source and toward the floor.
    float dist = distance(vUv, vec2(0.04, 1.08));
    float falloff = smoothstep(1.65, 0.05, dist);
    float floorFade = smoothstep(-0.15, 0.62, vUv.y);

    float g = beams * falloff * floorFade * uIntensity;

    // A whisper of emerald pooled at the base keeps the black from going flat.
    float pool = smoothstep(0.45, 0.0, vUv.y) * 0.055;

    gl_FragColor = vec4(uGold * g + uEmerald * pool, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 * Text sampling — the browser shapes Arabic for us inside fillText.
 * ------------------------------------------------------------------ */

/**
 * Renders `word` to an offscreen 2D canvas and returns shuffled sample points
 * centred on the origin and normalised so the ink box fits a unit square with
 * its aspect preserved (largest dimension spans 1.0). All world sizing is then
 * a single `group.scale`, which keeps the word correct across resizes without
 * ever re-rasterising the glyphs.
 * @returns {Float32Array|null} xy pairs in unit space, or null if nothing drew.
 */
function sampleWordPoints(word) {
  const W = 1600;
  const H = 900;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  // Size the glyphs against BOTH axes. Amiri sets tashkeel well above and below
  // the baseline, so fitting on width alone overshoots badly and the browser
  // silently clips the ink at the canvas edge — which samples as a cropped
  // blob rather than the word. Measure the real ink box and fit to it.
  const BASE = 200;
  ctx.font = `700 ${BASE}px 'Amiri', serif`;
  const m = ctx.measureText(word);
  const inkW = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || m.width || BASE;
  const inkH = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || BASE * 1.6;

  let fontPx = BASE * Math.min((W * 0.88) / inkW, (H * 0.80) / inkH);
  fontPx = Math.max(60, Math.min(700, fontPx));

  const STEP = 2;
  const xs = [];
  const ys = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let n = 0;

  // Draw, sample, and if the ink still touches an edge, shrink and retry.
  // Three attempts is ample; each is a single sub-megapixel pass.
  for (let attempt = 0; attempt < 3; attempt++) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = `700 ${fontPx}px 'Amiri', serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(word, W / 2, H / 2);

    const data = ctx.getImageData(0, 0, W, H).data;
    xs.length = 0;
    ys.length = 0;
    minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;

    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        if (data[(y * W + x) * 4 + 3] > 130) {
          xs.push(x);
          ys.push(y);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    n = xs.length;
    if (n === 0) return null; // font missing / canvas tainted / glyph unsupported

    const clipped = minX <= STEP || minY <= STEP ||
                    maxX >= W - 1 - STEP || maxY >= H - 1 - STEP;
    if (!clipped) break;
    fontPx *= 0.78;
  }

  // Fisher–Yates, so that wrapping around a short sample list still spreads
  // duplicate particles across the whole word instead of one dense corner.
  for (let i = n - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    let t = xs[i]; xs[i] = xs[j]; xs[j] = t;
    t = ys[i]; ys[i] = ys[j]; ys[j] = t;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  // Divide by the LARGER span so the aspect is preserved and the ink always
  // lands inside a unit square, whatever the word and its diacritics do.
  const half = Math.max(spanX, spanY) / 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = ((xs[i] - cx) / half) * 0.5;
    out[i * 2 + 1] = -((ys[i] - cy) / half) * 0.5; // canvas Y grows downward
  }
  return out;
}

/** Ring of points (unit space) used when the word cannot be rasterised at all. */
function fallbackRingPoints(count) {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = 0.5 * (0.92 + Math.random() * 0.08);
    out[i * 2] = Math.cos(a) * rr;
    out[i * 2 + 1] = Math.sin(a) * rr * 0.6;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

/** Frame-rate independent damping. */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Chooses a particle budget that a mid-range phone can hold at 60fps. */
function chooseParticleCount(width, height) {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let count = 7600;
  if (width < 900 || height < 520) count = 5200;
  if (width < 620) count = 4200;
  if (mem <= 4 || cores <= 4) count = Math.min(count, 4000);
  return count;
}

/* ------------------------------------------------------------------ *
 * Main entry
 * ------------------------------------------------------------------ */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ getScrollProgress?: () => number, particleCount?: number,
 *           word?: string, assembleDuration?: number }} [options]
 * @returns {{ destroy: () => void }}
 */
export function initHero(canvas, options = {}) {
  if (!canvas) throw new Error('initHero: a canvas element is required.');
  if (!hasWebGL()) throw new Error('initHero: WebGL is not available.');

  const getScrollProgress =
    typeof options.getScrollProgress === 'function' ? options.getScrollProgress : null;
  const word = options.word || WORD;
  const assembleDuration = options.assembleDuration || ASSEMBLE_DURATION;

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = Math.max(1, canvas.clientWidth || canvas.width || 1);
  let height = Math.max(1, canvas.clientHeight || canvas.height || 1);

  /* --- renderer ---------------------------------------------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // additive points do not benefit; saves fill rate
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
  } catch (e) {
    throw new Error('initHero: failed to create a WebGL context.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(COLOR_BG, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  /* --- god-ray backdrop -------------------------------------------- */
  const beamUniforms = {
    uTime: { value: 0 },
    uAspect: { value: width / height },
    uIntensity: { value: 0.34 },
    uDrift: { value: 0 },
    uGold: { value: GOLD_DEEP.clone() },
    uEmerald: { value: EMERALD.clone() }
  };
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: beamUniforms,
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  const beamGeometry = new THREE.PlaneGeometry(2, 2);
  const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
  beamMesh.frustumCulled = false;
  beamMesh.renderOrder = -1;
  scene.add(beamMesh);

  /* --- the word ----------------------------------------------------- */
  const COUNT = options.particleCount || chooseParticleCount(width, height);

  const positions = new Float32Array(COUNT * 3); // static; morph happens in GLSL
  const scatter = new Float32Array(COUNT * 3);
  const targets = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const sizes = new Float32Array(COUNT);
  const tints = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    // Scattered cloud, in the same unit space as the sampled word: a flattened
    // shell, denser toward the middle, and a little wider than the final word
    // so the assembly reads as a gathering-in.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const rad = 0.78 * Math.pow(Math.random(), 0.55) + 0.24;
    scatter[i * 3] = Math.sin(phi) * Math.cos(theta) * rad * 1.7;
    scatter[i * 3 + 1] = Math.cos(phi) * rad * 0.85;
    scatter[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * rad * 0.5;

    seeds[i] = Math.random();
    sizes[i] = 4.5 + Math.random() * 5.5;
    // Mostly gold with an ivory minority, so highlights read as light not noise.
    tints[i] = Math.pow(Math.random(), 1.9);
  }
  // Until the font resolves, aim at the scatter positions (a no-op morph).
  targets.set(scatter);

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const aTarget = new THREE.BufferAttribute(targets, 3);
  particleGeometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  particleGeometry.setAttribute('aTarget', aTarget);
  particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  particleGeometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 1));
  particleGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

  const particleUniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uSizeScale: { value: 1 },
    uIdle: { value: 0.008 }, // unit space — group.scale multiplies this up
    uGoldDeep: { value: GOLD_DEEP.clone() },
    uGoldLight: { value: GOLD_LIGHT.clone() },
    uIvory: { value: IVORY.clone() },
    uOpacity: { value: WORD_OPACITY }
  };
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: particleUniforms,
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(particleGeometry, particleMaterial);
  points.frustumCulled = false;

  const group = new THREE.Group(); // parallax is applied here, not to the camera
  group.add(points);
  group.position.y = WORD_Y_OFFSET;
  scene.add(group);

  /* --- dust motes ---------------------------------------------------- */
  const DUST_COUNT = width < 620 ? 220 : 400;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustScatter = new Float32Array(DUST_COUNT * 3);
  const dustSeed = new Float32Array(DUST_COUNT);
  const dustSize = new Float32Array(DUST_COUNT);
  const dustTint = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustScatter[i * 3] = (Math.random() - 0.5) * 26;
    dustScatter[i * 3 + 1] = (Math.random() - 0.5) * 15;
    dustScatter[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    dustSeed[i] = Math.random();
    dustSize[i] = 2.0 + Math.random() * 3.5;
    dustTint[i] = 0.35 + Math.random() * 0.65;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  // Dust never morphs: its scatter and target are the same buffer, so with
  // uProgress pinned to 1 the shader runs the idle-drift branch only.
  const dustAnchor = new THREE.BufferAttribute(dustScatter, 3);
  dustGeometry.setAttribute('aScatter', dustAnchor);
  dustGeometry.setAttribute('aTarget', dustAnchor);
  dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1));
  dustGeometry.setAttribute('aTint', new THREE.BufferAttribute(dustTint, 1));
  dustGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 25);

  const dustUniforms = {
    uTime: { value: 0 },
    uProgress: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uSizeScale: { value: 1 },
    uIdle: { value: 0.9 }, // motes wander far more than the letterform particles
    uGoldDeep: { value: GOLD_DEEP.clone() },
    uGoldLight: { value: GOLD_LIGHT.clone() },
    uIvory: { value: IVORY.clone() },
    uOpacity: { value: 0.4 }
  };
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  /* --- state -------------------------------------------------------- */
  let destroyed = false;
  let rafId = 0;
  let running = false;
  let visible = true; // IntersectionObserver
  let tabActive = !document.hidden;
  let elapsed = 0;
  let assembleStart = Infinity; // set once the word targets land

  const pointer = { x: 0, y: 0 }; // raw, normalised -1..1
  const eased = { x: 0, y: 0, scroll: 0 };
  const clock = new THREE.Clock();

  /** Writes sampled 2D letterform points into the aTarget buffer. */
  function applyWordTargets(pts2d) {
    const sampleCount = pts2d.length / 2;
    for (let i = 0; i < COUNT; i++) {
      const s = (i % sampleCount) * 2; // wrap when there are fewer samples
      // Jitter duplicates slightly so wrapped particles do not stack exactly.
      const dup = i >= sampleCount ? 0.008 : 0.003;
      targets[i * 3] = pts2d[s] + (Math.random() - 0.5) * dup;
      targets[i * 3 + 1] = pts2d[s + 1] + (Math.random() - 0.5) * dup;
      targets[i * 3 + 2] = (Math.random() - 0.5) * 0.09; // gentle depth
    }
    aTarget.needsUpdate = true;
  }

  /** Awaits the webfont, samples the glyphs, and arms the assembly. */
  function prepareWord() {
    const ready = document.fonts && document.fonts.ready
      ? document.fonts.ready
      : Promise.resolve();

    return ready
      .then(() => {
        // Nudge the font to load even if no DOM node currently uses it at 700.
        if (document.fonts && document.fonts.load) {
          return document.fonts.load(`700 360px 'Amiri'`, word).catch(() => {});
        }
      })
      .catch(() => {})
      .then(() => {
        if (destroyed) return;
        const pts = sampleWordPoints(word) || fallbackRingPoints(COUNT);
        applyWordTargets(pts);
        assembleStart = elapsed + ASSEMBLE_DELAY;
      });
  }

  /* --- sizing -------------------------------------------------------- */
  function applySize() {
    width = Math.max(1, canvas.clientWidth || width);
    height = Math.max(1, canvas.clientHeight || height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const pr = renderer.getPixelRatio();
    particleUniforms.uPixelRatio.value = pr;
    dustUniforms.uPixelRatio.value = pr;
    beamUniforms.uAspect.value = width / height;

    // The sampled word occupies a unit box, so scale IS its world size. Fit it
    // to the band cleared between the bismillah and the headline, bounded on
    // both axes so it neither overflows a narrow phone nor floats lost on an
    // ultrawide display.
    const vFov = (camera.fov * Math.PI) / 180;
    const visibleH = 2 * Math.tan(vFov / 2) * CAM_Z;
    const visibleW = visibleH * camera.aspect;
    const hFraction = width < 620 ? 0.30 : 0.36; // share of viewport height
    group.scale.setScalar(Math.min(visibleH * hFraction, visibleW * 0.62));

    const sizeScale = Math.min(1.25, Math.max(0.62, height / 900));
    particleUniforms.uSizeScale.value = sizeScale;
    dustUniforms.uSizeScale.value = sizeScale;
  }
  applySize();

  /* ================================================================== *
   * Reduced motion: one assembled frame, then stop.
   * ================================================================== */
  if (reducedMotion) {
    particleUniforms.uProgress.value = 1;
    particleUniforms.uIdle.value = 0;
    particleUniforms.uTime.value = 0;
    dustUniforms.uIdle.value = 0;
    dustUniforms.uTime.value = 0;
    beamUniforms.uTime.value = 0;

    const renderStill = () => {
      if (destroyed) return;
      renderer.render(scene, camera);
    };

    // Re-lay-out on resize (a static reflow, not motion) so the word never skews.
    let staticResizeTimer = 0;
    const staticResize = () => {
      clearTimeout(staticResizeTimer);
      staticResizeTimer = setTimeout(() => {
        if (destroyed) return;
        applySize();
        renderStill();
      }, 150);
    };
    const staticRO = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(staticResize)
      : null;
    if (staticRO) staticRO.observe(canvas);
    else window.addEventListener('resize', staticResize);

    renderStill(); // scattered frame, immediately replaced once the font lands
    prepareWord().then(renderStill);

    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(staticResizeTimer);
        if (staticRO) staticRO.disconnect();
        else window.removeEventListener('resize', staticResize);
        disposeAll();
      }
    };
  }

  /* ================================================================== *
   * Animated path
   * ================================================================== */
  prepareWord();

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  }
  function onPointerLeave() {
    pointer.x = 0;
    pointer.y = 0;
  }

  function frame() {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);

    // Clamp dt so a stalled tab or a slow first frame cannot jolt the scene.
    const dt = Math.min(clock.getDelta(), 1 / 30);
    elapsed += dt;

    // --- assembly progress
    if (elapsed >= assembleStart) {
      const t = Math.min(1, (elapsed - assembleStart) / assembleDuration);
      particleUniforms.uProgress.value = easeInOutCubic(t);
    }

    particleUniforms.uTime.value = elapsed;
    dustUniforms.uTime.value = elapsed * 0.34; // motes drift much more slowly
    beamUniforms.uTime.value = elapsed;

    // --- parallax (always damped, never raw)
    let scroll = 0;
    if (getScrollProgress) {
      const raw = Number(getScrollProgress());
      if (Number.isFinite(raw)) scroll = Math.min(1, Math.max(0, raw));
    }
    eased.x = damp(eased.x, pointer.x, 2.4, dt);
    eased.y = damp(eased.y, pointer.y, 2.4, dt);
    eased.scroll = damp(eased.scroll, scroll, 3.0, dt);

    group.position.x = eased.x * 0.42;
    group.position.y = WORD_Y_OFFSET - eased.y * 0.3 - eased.scroll * 1.6;
    group.rotation.y = eased.x * 0.075;
    group.rotation.x = eased.y * 0.05;

    dust.position.x = eased.x * 0.9;   // the nearer layer moves more
    dust.position.y = -eased.y * 0.6 - eased.scroll * 2.4;

    camera.position.z = CAM_Z + eased.scroll * 1.8;
    camera.lookAt(0, 0, 0);

    // Rays soften and slide as the page scrolls away from the hero.
    beamUniforms.uDrift.value = eased.x * 0.06 + eased.scroll * 0.12;
    beamUniforms.uIntensity.value = 0.34 * (1 - eased.scroll * 0.55);
    particleUniforms.uOpacity.value = WORD_OPACITY * (1 - eased.scroll * 0.35);

    renderer.render(scene, camera);
  }

  function start() {
    if (running || destroyed) return;
    running = true;
    clock.getDelta(); // discard the gap accumulated while paused
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function syncRunState() {
    if (visible && tabActive) start();
    else stop();
  }

  function onVisibilityChange() {
    tabActive = !document.hidden;
    syncRunState();
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!destroyed) applySize();
    }, 150);
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(onResize)
    : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  else window.addEventListener('resize', onResize);

  const intersectionObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
        visible = entries.some((en) => en.isIntersecting);
        syncRunState();
      }, { threshold: 0.01 })
    : null;
  if (intersectionObserver) intersectionObserver.observe(canvas);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  start();

  /* --- teardown ------------------------------------------------------ */
  function disposeAll() {
    particleGeometry.dispose();
    particleMaterial.dispose();
    dustGeometry.dispose();
    dustMaterial.dispose();
    beamGeometry.dispose();
    beamMaterial.dispose();
    scene.clear();
    const ctxLoss = renderer.getContext().getExtension('WEBGL_lose_context');
    renderer.dispose();
    if (ctxLoss) ctxLoss.loseContext();
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      clearTimeout(resizeTimer);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener('resize', onResize);
      if (intersectionObserver) intersectionObserver.disconnect();
      disposeAll();
    }
  };
}
