/**
 * Rocha Construtora — Motor Arquitetônico 3D Holográfico & PBR (`scene3d-three.js`).
 *
 * Arquitetura e Garantias:
 * 1. Ciclo de vida determinístico `mountObraScene()` / `disposeObraScene()` sem vazamento de GPU/DOM;
 * 2. Render-on-Demand (`invalidate()`) — 0 FPS / 0% GPU quando a cena estabiliza ou sai da viewport;
 * 3. Modo Holograma Técnico CAD (`EdgesGeometry` + `scanPlaneMesh`) vs Modo Arquitetônico Realista;
 * 4. Geometria volumétrica completa nas 6 etapas (nível a laser, sapatas/estribos CA-50, pilares/laje,
 *    alvenaria com vergas/contravergas e tesouras, QDC elétrico + prumadas hidráulicas, entrega + chave);
 * 5. Explosão Omnidirecional 3D (`dx, dy, dz`) em 18 subgrupos + linhas-guia tracejadas + câmera adaptativa;
 * 6. Zero mutação de `element.style.*` (`renderer.setSize(w, h, false)` -> 100% compatível com `style-src-attr 'none'`).
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const now = () => performance.now();

/** @type {(() => void) | null} */
let activeCleanupFn = null;
/** @type {boolean} */
let mountPending = false;

/**
 * Vetores tridimensionais determinísticos de explosão omnidirecional por subgrupo (em metros).
 */
const EXPLODE_VECTORS = Object.freeze({
  "terrain-macico": [0.0, -2.4, 0.0],
  "terrain-markers": [-0.35, -1.65, 0.35],
  "foundation-sapatas": [0.0, -1.55, 0.0],
  "foundation-baldrames": [0.0, -0.85, 0.0],
  "floor-porcelain": [0.0, -0.2, 0.0],
  "structure-pillars-west": [-0.95, 0.25, 0.0],
  "structure-pillars-east": [0.95, 0.25, 0.0],
  "wall-front-south": [0.0, 0.35, 2.65],
  "delivery-garage-south": [-0.65, 0.15, 3.85],
  "wall-back-north": [0.0, 0.35, -2.55],
  "wall-left-west": [-2.5, 0.35, 0.0],
  "mep-plumbing-west": [-3.65, 0.55, 0.0],
  "wall-right-east": [2.5, 0.35, 0.0],
  "mep-electrical-brise-east": [3.65, 0.55, 0.25],
  "wall-interior-core": [0.0, 0.55, 0.0],
  "structure-slab-beams": [0.0, 1.85, 0.0],
  "roof-trusses": [0.0, 2.85, -0.25],
  "roof-tiles-parapet": [0.45, 3.85, 0.35],
  "delivery-key": [0.0, 4.55, 1.8],
});

/**
 * Âncoras representativas `[x, y, z]` de cada subgrupo para traçado das linhas-guia holográficas.
 */
const ROLE_ANCHORS = Object.freeze({
  "terrain-macico": [-0.3, 0.0, -0.8],
  "terrain-markers": [-3.8, 0.55, 2.1],
  "foundation-sapatas": [-1.9, 0.18, -1.4],
  "foundation-baldrames": [-0.4, 0.38, -1.0],
  "floor-porcelain": [-0.4, 0.52, -1.0],
  "structure-pillars-west": [-4.4, 1.65, -1.4],
  "structure-pillars-east": [4.4, 1.85, -0.6],
  "wall-front-south": [0.2, 1.65, 2.0],
  "delivery-garage-south": [-2.85, 1.4, 3.6],
  "wall-back-north": [0.2, 1.65, -4.0],
  "wall-left-west": [-4.4, 1.65, -1.4],
  "mep-plumbing-west": [-4.52, 1.65, 0.4],
  "wall-right-east": [4.4, 1.85, -0.6],
  "mep-electrical-brise-east": [4.48, 1.65, -0.2],
  "wall-interior-core": [0.6, 1.65, -1.4],
  "structure-slab-beams": [0.2, 3.05, -1.0],
  "roof-trusses": [2.5, 3.35, -0.6],
  "roof-tiles-parapet": [0.6, 3.65, -0.8],
  "delivery-key": [0.75, 2.2, 3.55],
});

const STAGE_HEIGHT_RANGES = Object.freeze({
  1: [-0.2, 1.05],
  2: [0.0, 0.95],
  3: [0.45, 3.55],
  4: [0.45, 4.15],
  5: [0.45, 3.65],
  6: [0.05, 3.95],
});

/**
 * Inicializa a cena Three.js completa dentro de `host` (`#iso-webgl`).
 * @param {any} THREE
 * @param {HTMLElement} host
 * @param {HTMLElement} wrap
 * @returns {(() => void) | null}
 */
function createSceneInstance(THREE, host, wrap) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let seed = 20261030;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (error) {
    console.warn("[Maquete 3D] WebGL indisponível:", error);
    return null;
  }

  /** @type {Set<any>} */
  const trackedTextures = new Set();
  /** @type {Set<any>} */
  const trackedGeometries = new Set();
  /** @type {Set<any>} */
  const trackedMaterials = new Set();

  const trackTex = (t) => {
    if (t) trackedTextures.add(t);
    return t;
  };
  const trackGeo = (g) => {
    if (g) trackedGeometries.add(g);
    return g;
  };
  const trackMat = (m) => {
    if (m) trackedMaterials.add(m);
    return m;
  };

  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1), 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.replaceChildren(renderer.domElement);
  wrap.classList.add("has-webgl");

  const canvasTex = (size, draw, srgb = true) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    draw(ctx, size);
    const texture = trackTex(new THREE.CanvasTexture(canvas));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const normalFromCanvas = (canvas, strength = 2.4) => {
    const size = canvas.width;
    const source = canvas
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, size, size).data;
    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const ctx = out.getContext("2d");
    const image = ctx.createImageData(size, size);
    const lum = (x, y) => {
      const xi = (x + size) % size;
      const yi = (y + size) % size;
      const idx = (yi * size + xi) * 4;
      return (source[idx] * 0.299 + source[idx + 1] * 0.587 + source[idx + 2] * 0.114) / 255;
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
        const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        image.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
        image.data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
        image.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const texture = trackTex(new THREE.CanvasTexture(out));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const buildTextures = () => {
    const tex = {};
    tex.paver = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#b9b4a9";
      ctx.fillRect(0, 0, w, w);
      const cell = w / 4;
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const tone = 196 + Math.floor(rnd() * 26);
          ctx.fillStyle = `rgb(${tone}, ${tone - 3}, ${tone - 10})`;
          ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        }
      }
      ctx.strokeStyle = "rgba(120,115,105,0.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, w);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(w, i * cell);
        ctx.stroke();
      }
    });

    tex.grass = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#3d5a3f";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 2000; i += 1) {
        const g = 60 + Math.floor(rnd() * 70);
        ctx.fillStyle = `rgba(${g - 18}, ${g + 28}, ${g - 12}, ${0.25 + rnd() * 0.4})`;
        ctx.fillRect(rnd() * w, rnd() * w, 2, 2 + rnd() * 3);
      }
    });

    tex.concrete = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#b7b7b2";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 800; i += 1) {
        const v = 150 + Math.floor(rnd() * 70);
        ctx.fillStyle = `rgba(${v}, ${v}, ${v - 4}, ${0.12 + rnd() * 0.2})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * w, 0.6 + rnd() * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    tex.brick = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#b9a998";
      ctx.fillRect(0, 0, w, w);
      const rows = 8;
      const rowH = w / rows;
      const brickW = w / 4;
      for (let r = 0; r < rows; r += 1) {
        const offset = (r % 2) * (brickW / 2);
        for (let c = -1; c < 5; c += 1) {
          const tone = 168 + Math.floor(rnd() * 34);
          ctx.fillStyle = `rgb(${tone}, ${tone - 26}, ${tone - 48})`;
          ctx.fillRect(c * brickW + offset + 2, r * rowH + 2, brickW - 4, rowH - 4);
        }
      }
    });

    tex.stone = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#8d8579";
      ctx.fillRect(0, 0, w, w);
      const rows = 5;
      const rowH = w / rows;
      for (let r = 0; r < rows; r += 1) {
        let x = -20 + rnd() * 20;
        while (x < w) {
          const bw = 32 + rnd() * 46;
          const tone = 150 + Math.floor(rnd() * 55);
          ctx.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 16})`;
          ctx.fillRect(x + 1.5, r * rowH + 1.5, bw - 3, rowH - 3);
          x += bw;
        }
      }
    });

    tex.wood = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#6d4a2f";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 42; i += 1) {
        const x = rnd() * w;
        ctx.strokeStyle = `rgba(${40 + rnd() * 40}, ${26 + rnd() * 26}, ${16 + rnd() * 18}, ${0.18 + rnd() * 0.4})`;
        ctx.lineWidth = 0.8 + rnd() * 2.4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 6, w * 0.33, x - 6, w * 0.66, x + 3, w);
        ctx.stroke();
      }
    });

    tex.roof = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#7a2f22";
      ctx.fillRect(0, 0, w, w);
      const rows = 6;
      const rowH = w / rows;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < 8; c += 1) {
          const tone = 118 + Math.floor(rnd() * 38);
          ctx.fillStyle = `rgb(${tone}, ${Math.round(tone * 0.42)}, ${Math.round(tone * 0.32)})`;
          ctx.beginPath();
          ctx.roundRect(c * (w / 8) + 1, r * rowH + 1, w / 8 - 2, rowH - 2, 6);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(35, 12, 8, 0.28)";
        ctx.fillRect(0, (r + 1) * rowH - 3, w, 3);
      }
    });

    tex.porcelain = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#d9d2c6";
      ctx.fillRect(0, 0, w, w);
      const cell = w / 2;
      for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < 2; x += 1) {
          const tone = 208 + Math.floor(rnd() * 22);
          ctx.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 16})`;
          ctx.fillRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
        }
      }
      ctx.strokeStyle = "rgba(150,140,128,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, w - 1, w - 1);
      ctx.beginPath();
      ctx.moveTo(cell, 0);
      ctx.lineTo(cell, w);
      ctx.moveTo(0, cell);
      ctx.lineTo(w, cell);
      ctx.stroke();
    });

    tex.dirt = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#6b503a";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 1100; i += 1) {
        const v = 70 + Math.floor(rnd() * 70);
        ctx.fillStyle = `rgba(${v + 24}, ${v}, ${v - 14}, ${0.2 + rnd() * 0.35})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * w, 0.7 + rnd() * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    tex.gravel = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#9c968c";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 1000; i += 1) {
        const v = 120 + Math.floor(rnd() * 90);
        ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 12}, ${0.4 + rnd() * 0.4})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * w, 0.8 + rnd() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    tex.plaster = canvasTex(256, (ctx, w) => {
      ctx.fillStyle = "#e9e2d6";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 1800; i += 1) {
        const v = 204 + Math.floor(rnd() * 40);
        ctx.fillStyle = `rgba(${v}, ${v - 5}, ${v - 14}, ${0.07 + rnd() * 0.15})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * w, 0.5 + rnd() * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    tex.microRough = canvasTex(
      256,
      (ctx, w) => {
        ctx.fillStyle = "#d6d6d6";
        ctx.fillRect(0, 0, w, w);
        for (let i = 0; i < 1200; i += 1) {
          const v = 184 + Math.floor(rnd() * 64);
          ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${0.12 + rnd() * 0.3})`;
          ctx.beginPath();
          ctx.arc(rnd() * w, rnd() * w, 1 + rnd() * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      false
    );

    tex.plasterNormal = normalFromCanvas(tex.plaster.image, 1.1);
    tex.concreteNormal = normalFromCanvas(tex.concrete.image, 1.4);
    tex.gravelNormal = normalFromCanvas(tex.gravel.image, 2.2);
    tex.grassNormal = normalFromCanvas(tex.grass.image, 1.6);
    tex.paverNormal = normalFromCanvas(tex.paver.image, 2.2);
    tex.woodNormal = normalFromCanvas(tex.wood.image, 2.6);
    tex.stoneNormal = normalFromCanvas(tex.stone.image, 3.2);
    tex.porcelainNormal = normalFromCanvas(tex.porcelain.image, 1.8);
    tex.roofNormal = normalFromCanvas(tex.roof.image, 2.8);

    Object.values(tex).forEach((texture) => {
      texture.anisotropy = maxAniso;
    });
    return tex;
  };

  const tex = buildTextures();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 240);

  const root = new THREE.Group();
  scene.add(root);

  const layerGroups = {};
  for (let layer = 1; layer <= 6; layer += 1) {
    const group = new THREE.Group();
    layerGroups[layer] = group;
    root.add(group);
  }

  const standard = (options) => {
    const material = trackMat(
      new THREE.MeshStandardMaterial({
        roughness: 0.92,
        metalness: 0.02,
        envMapIntensity: 0.75,
        ...options,
      })
    );
    material.userData.baseOpacity = material.opacity;
    return material;
  };

  const repeatTexture = (source, repeatX, repeatY) => {
    const texture = trackTex(source.clone());
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
  };

  const mapped = (base, repeatX, repeatY, options = {}) => {
    const { normal, rough, ...rest } = options;
    const config = { map: repeatTexture(base, repeatX, repeatY), ...rest };
    if (normal) {
      config.normalMap = repeatTexture(normal, repeatX, repeatY);
      if (!config.normalScale) {
        config.normalScale = new THREE.Vector2(0.65, 0.65);
      }
    }
    if (rough) config.roughnessMap = repeatTexture(rough, repeatX, repeatY);
    return standard(config);
  };

  const M = {
    plinth: standard({ color: 0x161b22, roughness: 0.55, metalness: 0.25 }),
    plinthEdge: standard({
      color: 0x8d7440,
      roughness: 0.4,
      metalness: 0.8,
      emissive: 0x2a1f0b,
      emissiveIntensity: 0.4,
    }),
    gravel: mapped(tex.gravel, 7, 9, {
      roughness: 0.98,
      normal: tex.gravelNormal,
      rough: tex.microRough,
    }),
    grass: mapped(tex.grass, 3, 4, {
      roughness: 1,
      normal: tex.grassNormal,
      rough: tex.microRough,
    }),
    paver: mapped(tex.paver, 5, 8, {
      roughness: 0.82,
      normal: tex.paverNormal,
      rough: tex.microRough,
    }),
    sidewalk: mapped(tex.paver, 10, 2, {
      color: 0xe9e5dd,
      roughness: 0.9,
      normal: tex.paverNormal,
    }),
    dirt: mapped(tex.dirt, 3, 3, { roughness: 1 }),
    soil: mapped(tex.dirt, 3, 4, {
      color: 0x8a7358,
      roughness: 1,
      normal: tex.gravelNormal,
    }),
    concrete: mapped(tex.concrete, 2, 2, {
      color: 0xc9c8c2,
      roughness: 0.92,
      normal: tex.concreteNormal,
    }),
    concreteDark: mapped(tex.concrete, 2, 2, {
      color: 0x9a9b9f,
      roughness: 0.94,
      normal: tex.concreteNormal,
    }),
    slab: mapped(tex.concrete, 4, 4, {
      color: 0xd2d1cb,
      roughness: 0.88,
      normal: tex.concreteNormal,
      rough: tex.microRough,
    }),
    steel: standard({ color: 0x98a2ad, metalness: 0.85, roughness: 0.35 }),
    alu: standard({ color: 0x1f242a, metalness: 0.82, roughness: 0.3 }),
    glass: standard({
      color: 0xbfdbe8,
      metalness: 0.08,
      roughness: 0.03,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      envMapIntensity: 2.4,
    }),
    warmGlass: standard({
      color: 0xffd9a1,
      emissive: 0xffbf72,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
    wood: mapped(tex.wood, 2, 1, {
      roughness: 0.55,
      normal: tex.woodNormal,
      rough: tex.microRough,
    }),
    woodDark: standard({ color: 0x4a3322, roughness: 0.62 }),
    stone: mapped(tex.stone, 3, 2, {
      roughness: 0.82,
      normal: tex.stoneNormal,
      rough: tex.microRough,
    }),
    porcelain: mapped(tex.porcelain, 5, 4, {
      roughness: 0.22,
      metalness: 0.06,
      envMapIntensity: 1.2,
      normal: tex.porcelainNormal,
      rough: tex.microRough,
    }),
    roof: mapped(tex.roof, 4, 3, {
      roughness: 0.7,
      normal: tex.roofNormal,
      rough: tex.microRough,
    }),
    plaster: mapped(tex.plaster, 3, 2, {
      roughness: 0.94,
      normal: tex.plasterNormal,
      rough: tex.microRough,
    }),
    paint: mapped(tex.plaster, 4, 3, {
      color: 0xf6f1e8,
      roughness: 0.9,
      normal: tex.plasterNormal,
    }),
    sill: mapped(tex.stone, 2, 1, {
      color: 0xd8d2c6,
      roughness: 0.55,
      normal: tex.stoneNormal,
    }),
    baseboard: standard({ color: 0x4a4640, roughness: 0.6, metalness: 0.05 }),
    black: standard({ color: 0x20242a, metalness: 0.55, roughness: 0.5 }),
    gold: standard({
      color: 0xc9a45c,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x6b4d18,
      emissiveIntensity: 0.55,
    }),
    light: standard({
      color: 0xfff0cd,
      emissive: 0xffcf87,
      emissiveIntensity: 2.6,
      roughness: 1,
    }),
    laserBeam: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      })
    ),
    water: standard({ color: 0x3d7f9e, metalness: 0.35, roughness: 0.45 }),
    sewage: standard({ color: 0xe2dfd7, roughness: 0.55 }),
    conduit: standard({ color: 0xd97724, roughness: 0.55 }),
    qdcBreaker: standard({ color: 0x0ea5e9, metalness: 0.35, roughness: 0.4 }),
    key: standard({
      color: 0xe6c273,
      metalness: 1,
      roughness: 0.18,
      emissive: 0x8a6520,
      emissiveIntensity: 0.9,
    }),
  };

  const contactTexture = canvasTex(
    256,
    (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      const gradient = ctx.createRadialGradient(w / 2, w / 2, w * 0.04, w / 2, w / 2, w * 0.5);
      gradient.addColorStop(0, "rgba(6, 9, 12, 0.6)");
      gradient.addColorStop(0.52, "rgba(6, 9, 12, 0.3)");
      gradient.addColorStop(1, "rgba(6, 9, 12, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, w);
    },
    false
  );
  contactTexture.wrapS = THREE.ClampToEdgeWrapping;
  contactTexture.wrapT = THREE.ClampToEdgeWrapping;
  const contactMaterial = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactTexture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      toneMapped: false,
    })
  );

  // Materiais de arestas CAD para o Modo Holograma Técnico
  const cadCurrentMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  const cadBuiltMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xe2c58a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    })
  );

  const brickMaterial = (width, height) =>
    mapped(tex.brick, Math.max(1, width / 1.1), Math.max(1, height / 1.1), {
      roughness: 0.95,
    });

  const registry = [];
  const tweens = [];
  const wallSwaps = [];
  const lintelMeshes = [];
  const embeddedPillars = [];
  const cadEdgeLines = [];

  const collectMaterials = (object) => {
    const list = [];
    object.traverse((node) => {
      if (!node.material || node.isLineSegments) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((mat) => {
        if (mat.userData.baseOpacity === undefined) {
          mat.userData.baseOpacity = mat.opacity ?? 1;
        }
        if (!list.includes(mat)) list.push(mat);
      });
    });
    return list;
  };

  const attachCadEdges = (object, stage) => {
    object.traverse((node) => {
      if (!node.isMesh || !node.geometry || node.userData.noCadEdges) return;
      const edgesGeo = trackGeo(new THREE.EdgesGeometry(node.geometry, 24));
      const line = new THREE.LineSegments(edgesGeo, cadBuiltMat);
      line.userData.isCadEdge = true;
      line.renderOrder = 4;
      node.add(line);
      cadEdgeLines.push({ line, stage });
    });
  };

  /**
   * Registra um subgrupo na maquete com suporte a explosão omnidirecional e inspeção anatômica.
   */
  const add = (
    mesh,
    stage,
    layer = stage,
    until = 6,
    grow = false,
    explodeRole = "floor-porcelain",
    showInExplosion = false
  ) => {
    const vecArr = EXPLODE_VECTORS[explodeRole] || [0, 0, 0];
    const basePos = mesh.position.clone();
    attachCadEdges(mesh, stage);
    const item = {
      obj: mesh,
      stage,
      layer,
      until,
      grow,
      explodeRole,
      showInExplosion,
      basePos,
      explodeVec: new THREE.Vector3(vecArr[0], vecArr[1], vecArr[2]),
      mats: null,
      shown: false,
      delay: 0,
    };
    mesh.userData.item = item;
    layerGroups[layer].add(mesh);
    item.mats = collectMaterials(mesh);
    registry.push(item);
    mesh.visible = false;
    return mesh;
  };

  const box = (w, h, d, material, x, y, z, options = {}) => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y, z);
    if (options.rx) mesh.rotation.x = options.rx;
    if (options.ry) mesh.rotation.y = options.ry;
    if (options.rz) mesh.rotation.z = options.rz;
    if (options.noCadEdges) mesh.userData.noCadEdges = true;
    mesh.castShadow = options.cast !== false;
    mesh.receiveShadow = options.receive !== false;
    return mesh;
  };

  const plane = (w, d, material, x, y, z, noCadEdges = true) => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w, d)), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.userData.noCadEdges = noCadEdges;
    return mesh;
  };

  const cylinder = (radius, height, material, x, y, z, options = {}) => {
    const mesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(radius, radius, height, options.segments || 12)),
      material
    );
    mesh.position.set(x, y, z);
    if (options.rx) mesh.rotation.x = options.rx;
    if (options.rz) mesh.rotation.z = options.rz;
    mesh.userData.noCadEdges = options.noCadEdges !== false;
    mesh.castShadow = options.cast !== false;
    mesh.receiveShadow = true;
    return mesh;
  };

  const wall = ({ width, height, thickness, material, openings = [] }) => {
    const group = new THREE.Group();
    const parts = [];
    let cursor = -width / 2;
    const sorted = [...openings].sort((a, b) => a.x0 - b.x0);
    sorted.forEach((opening) => {
      if (opening.x0 > cursor) parts.push([cursor, opening.x0]);
      cursor = Math.max(cursor, opening.x1);
    });
    if (cursor < width / 2) parts.push([cursor, width / 2]);

    parts.forEach(([x0, x1]) => {
      if (x1 - x0 < 0.02) return;
      group.add(box(x1 - x0, height, thickness, material, (x0 + x1) / 2, height / 2, 0));
    });

    sorted.forEach((opening) => {
      const w = opening.x1 - opening.x0;
      const cx = (opening.x0 + opening.x1) / 2;
      if (opening.y0 > 0.01) {
        group.add(box(w, opening.y0, thickness, material, cx, opening.y0 / 2, 0));
      }
      if (opening.y1 < height - 0.01) {
        group.add(
          box(w, height - opening.y1, thickness, material, cx, (opening.y1 + height) / 2, 0)
        );
      }
    });
    return group;
  };

  const FLOOR = 0.5;
  const A = { x0: -4.4, x1: 0.6, z0: -4.4, z1: 1.6, top: 2.9 };
  const B = { x0: 0.6, x1: 4.4, z0: -3.6, z1: 2.4, top: 3.4 };

  const WALLS = [
    {
      id: "A-frente",
      explodeRole: "wall-front-south",
      x: -1.9,
      z: A.z1,
      width: 5.0,
      height: 2.4,
      ry: 0,
      openings: [
        { x0: 0.6, x1: 1.7, y0: 0, y1: 1.98, kind: "door" },
        { x0: -2.1, x1: -0.2, y0: 0.95, y1: 1.95, kind: "window" },
      ],
    },
    {
      id: "A-fundo",
      explodeRole: "wall-back-north",
      x: -1.9,
      z: A.z0,
      width: 5.0,
      height: 2.4,
      ry: 0,
      openings: [{ x0: -0.9, x1: 0.7, y0: 0.95, y1: 1.95, kind: "window" }],
    },
    {
      id: "A-esquerda",
      explodeRole: "wall-left-west",
      x: A.x0,
      z: -1.4,
      width: 6.0,
      height: 2.4,
      ry: Math.PI / 2,
      openings: [
        { x0: -1.95, x1: -0.55, y0: 0.95, y1: 1.95, kind: "window" },
        { x0: 0.75, x1: 1.95, y0: 0.95, y1: 1.95, kind: "window" },
      ],
    },
    {
      id: "B-frente",
      explodeRole: "wall-front-south",
      x: 2.5,
      z: B.z1,
      width: 3.8,
      height: 2.9,
      ry: 0,
      openings: [{ x0: -1.3, x1: 1.05, y0: 0.85, y1: 2.15, kind: "window" }],
    },
    {
      id: "B-fundo",
      explodeRole: "wall-back-north",
      x: 2.5,
      z: B.z0,
      width: 3.8,
      height: 2.9,
      ry: 0,
      openings: [{ x0: -0.95, x1: 0.65, y0: 0.95, y1: 1.95, kind: "window" }],
    },
    {
      id: "B-direita",
      explodeRole: "wall-right-east",
      x: B.x1,
      z: -0.6,
      width: 6.0,
      height: 2.9,
      ry: Math.PI / 2,
      openings: [{ x0: -1.0, x1: 0.9, y0: 0.95, y1: 2.05, kind: "window" }],
    },
    {
      id: "A-divisa",
      explodeRole: "wall-interior-core",
      x: A.x1,
      z: -1.4,
      width: 6.0,
      height: 2.4,
      ry: Math.PI / 2,
      openings: [{ x0: -0.5, x1: 0.3, y0: 0, y1: 2.0, kind: "door" }],
    },
  ];

  const place = (object, spec) => {
    object.position.set(spec.x, FLOOR, spec.z);
    object.rotation.y = spec.ry;
    return object;
  };

  /* ---------------------------------------------------------------------
     ETAPA 01: Terreno 3D, Gabarito Perimetral, Tripé Laser e Planta Luminosa
     --------------------------------------------------------------------- */
  const buildTerrain = () => {
    const group = new THREE.Group();
    group.add(box(13.9, 0.1, 15.9, M.plinth, 0, -0.34, 0, { cast: false, receive: false }));
    group.add(box(13.55, 0.3, 15.55, M.soil, 0, -0.16, 0, { cast: false }));
    group.add(
      box(13.46, 0.03, 15.46, M.plinthEdge, 0, -0.006, 0, { cast: false, receive: false })
    );
    group.add(plane(12, 14, M.gravel, 0, 0.012, 0));
    group.add(plane(0.55, 14, M.grass, -5.72, 0.02, 0));
    group.add(plane(0.55, 14, M.grass, 5.72, 0.02, 0));
    group.add(plane(12, 0.6, M.grass, 0, 0.02, -6.7));
    group.add(plane(12, 1.0, M.sidewalk, 0, 0.025, 6.6));
    group.add(box(12, 0.12, 0.16, M.concrete, 0, 0.07, 7.12, { cast: false }));

    const contact = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(11.6, 10.6)), contactMaterial);
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(-0.9, 0.032, -0.95);
    contact.renderOrder = 1;
    contact.userData.noCadEdges = true;
    group.add(contact);

    const markers = new THREE.Group();
    const gridTexture = canvasTex(256, (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i += 1) {
        const p = (i / 4) * w;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, w);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(226, 197, 138, 0.95)";
      ctx.strokeRect(4, 4, w - 8, w - 8);
    });
    const gridMaterial = standard({
      map: gridTexture,
      transparent: true,
      opacity: 0.62,
      roughness: 1,
      metalness: 0,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.42,
      depthWrite: false,
    });
    gridMaterial.map.repeat.set(3, 3);
    const grid = plane(9.6, 7.8, gridMaterial, -0.1, 0.045, -0.9);
    grid.receiveShadow = false;
    markers.add(grid);

    const stringMat = standard({
      color: 0xe8c46a,
      emissive: 0x6b4d18,
      emissiveIntensity: 0.65,
      roughness: 0.8,
    });
    const corners = [
      [A.x0 - 0.45, A.z0 - 0.45],
      [B.x1 + 0.45, A.z0 - 0.45],
      [B.x1 + 0.45, B.z1 + 0.45],
      [A.x0 - 0.45, B.z1 + 0.45],
    ];
    corners.forEach(([x, z]) => {
      markers.add(cylinder(0.032, 0.68, M.wood, x, 0.34, z, { segments: 6 }));
      markers.add(box(0.55, 0.08, 0.03, M.wood, x, 0.56, z));
      markers.add(box(0.03, 0.08, 0.55, M.wood, x, 0.56, z));
    });

    const stringY = 0.56;
    const spanX = corners[1][0] - corners[0][0];
    const spanZ = corners[2][1] - corners[0][1];
    const midX = (corners[0][0] + corners[1][0]) / 2;
    const midZ = (corners[0][1] + corners[2][1]) / 2;
    markers.add(box(0.018, 0.018, spanZ, stringMat, corners[0][0], stringY, midZ, { cast: false }));
    markers.add(box(0.018, 0.018, spanZ, stringMat, corners[1][0], stringY, midZ, { cast: false }));
    markers.add(box(spanX, 0.018, 0.018, stringMat, midX, stringY, corners[0][1], { cast: false }));
    markers.add(box(spanX, 0.018, 0.018, stringMat, midX, stringY, corners[2][1], { cast: false }));

    // Tripé topográfico 3D com nível rotativo a laser
    const lx = -3.8;
    const lz = 3.55;
    markers.add(cylinder(0.022, 0.92, M.alu, lx - 0.16, 0.44, lz + 0.14, { rz: -0.18 }));
    markers.add(cylinder(0.022, 0.92, M.alu, lx + 0.16, 0.44, lz + 0.14, { rz: 0.18 }));
    markers.add(cylinder(0.022, 0.92, M.alu, lx, 0.44, lz - 0.18, { rx: 0.18 }));
    markers.add(box(0.22, 0.18, 0.22, M.gold, lx, 0.95, lz));
    markers.add(cylinder(0.07, 0.09, M.qdcBreaker, lx, 1.08, lz, { segments: 12 }));
    // Feixes de laser horizontais de nivelamento
    markers.add(
      box(8.8, 0.014, 0.014, M.laserBeam, lx + 4.4, 1.08, lz - 1.5, {
        ry: -0.32,
        cast: false,
        noCadEdges: true,
      })
    );
    markers.add(
      box(0.014, 0.014, 7.6, M.laserBeam, lx + 1.2, 1.08, lz - 3.6, {
        ry: 0.22,
        cast: false,
        noCadEdges: true,
      })
    );

    add(markers, 1, 1, 1, false, "terrain-markers", true);
    add(group, 1, 1, 6, false, "terrain-macico", true);
  };

  /* ---------------------------------------------------------------------
     ETAPA 02: Fundação — Sapatas CA-50 & Vigas Baldrame Impermeabilizadas
     --------------------------------------------------------------------- */
  const columnsA = [
    [-4.4, -4.4],
    [-0.3, -4.4],
    [0.6, -4.4],
    [-4.4, -1.4],
    [-1.9, -1.4],
    [0.6, 0.3],
    [-4.4, 1.6],
    [-1.9, 1.6],
    [0.6, 1.6],
  ];
  const columnsB = [
    [0.6, -3.6],
    [3.75, -3.6],
    [4.4, -3.6],
    [0.6, -0.6],
    [2.5, -0.6],
    [4.4, 1.4],
    [0.6, 2.4],
    [3.75, 2.4],
    [4.4, 2.4],
  ];

  const buildFoundation = () => {
    const sapatasGroup = new THREE.Group();
    const baldrameGroup = new THREE.Group();
    const columns = [...columnsA, ...columnsB];

    const trench = (w, d, x, z, y) => {
      sapatasGroup.add(box(w, 0.026, d, M.dirt, x, y, z, { cast: false, receive: false }));
    };
    const v = 0.036;
    trench(5.5, 0.46, -1.9, -4.4, v);
    trench(5.5, 0.46, -1.9, 1.6, v);
    trench(0.46, 6.5, -4.4, -1.4, v);
    trench(0.46, 6.5, 0.6, -1.4, v);
    trench(4.1, 0.46, 2.5, -3.6, v);
    trench(4.1, 0.46, 2.5, 2.4, v);
    trench(0.46, 6.5, 4.4, -0.6, v);

    columns.forEach(([x, z]) => {
      trench(0.96, 0.96, x, z, 0.04);
      sapatasGroup.add(box(0.8, 0.05, 0.8, M.concreteDark, x, 0.045, z, { cast: false }));
      sapatasGroup.add(box(0.64, 0.2, 0.64, M.concrete, x, 0.17, z));
      sapatasGroup.add(box(0.18, 0.4, 0.18, M.concrete, x, 0.44, z));

      const barY = 0.68;
      [
        [-0.06, -0.06],
        [0.06, -0.06],
        [-0.06, 0.06],
        [0.06, 0.06],
      ].forEach(([dx, dz]) => {
        sapatasGroup.add(
          cylinder(0.012, 0.2, M.steel, x + dx, barY, z + dz, { segments: 6, cast: false })
        );
      });
      sapatasGroup.add(box(0.15, 0.018, 0.018, M.steel, x, barY + 0.07, z - 0.06, { cast: false }));
      sapatasGroup.add(box(0.15, 0.018, 0.018, M.steel, x, barY + 0.07, z + 0.06, { cast: false }));
      sapatasGroup.add(box(0.018, 0.018, 0.14, M.steel, x - 0.06, barY + 0.07, z, { cast: false }));
      sapatasGroup.add(box(0.018, 0.018, 0.14, M.steel, x + 0.06, barY + 0.07, z, { cast: false }));
    });

    const baldrame = (w, d, x, z) => {
      baldrameGroup.add(box(w, 0.26, d, M.concrete, x, 0.37, z));
      baldrameGroup.add(box(w + 0.05, 0.025, d + 0.05, M.black, x, 0.51, z, { cast: false }));
      if (w > d) {
        baldrameGroup.add(
          box(w, 0.28, 0.02, M.black, x, 0.36, z - d / 2 - 0.01, { cast: false })
        );
        baldrameGroup.add(
          box(w, 0.28, 0.02, M.black, x, 0.36, z + d / 2 + 0.01, { cast: false })
        );
      } else {
        baldrameGroup.add(
          box(0.02, 0.28, d, M.black, x - w / 2 - 0.01, 0.36, z, { cast: false })
        );
        baldrameGroup.add(
          box(0.02, 0.28, d, M.black, x + w / 2 + 0.01, 0.36, z, { cast: false })
        );
      }
    };

    baldrame(5.2, 0.26, -1.9, -4.4);
    baldrame(5.2, 0.26, -1.9, 1.6);
    baldrame(0.26, 6.2, -4.4, -1.4);
    baldrame(0.26, 6.2, 0.6, -1.4);
    baldrame(3.8, 0.26, 2.5, -3.6);
    baldrame(3.8, 0.26, 2.5, 2.4);
    baldrame(0.26, 6.2, 4.4, -0.6);

    baldrameGroup.add(box(4.86, 0.08, 5.86, M.concreteDark, -1.9, 0.46, -1.4, { cast: false }));
    baldrameGroup.add(box(3.66, 0.08, 5.86, M.concreteDark, 2.5, 0.46, -0.6, { cast: false }));

    add(sapatasGroup, 2, 2, 3, false, "foundation-sapatas", true);
    add(baldrameGroup, 2, 2, 3, false, "foundation-baldrames", true);
  };

  /* ---------------------------------------------------------------------
     ETAPA 03: Estrutura — Pilares Oeste/Leste, Vigas, Escoras & Laje Treliçada
     --------------------------------------------------------------------- */
  const buildStructure = () => {
    const pillarsWest = new THREE.Group();
    const pillarsEast = new THREE.Group();
    const slabAndShores = new THREE.Group();

    const onWall = (x, z) =>
      WALLS.some((spec) => {
        const half = spec.width / 2 + 0.11;
        if (Math.abs(spec.ry) < 0.5) {
          return Math.abs(z - spec.z) < 0.12 && Math.abs(x - spec.x) <= half;
        }
        return Math.abs(x - spec.x) < 0.12 && Math.abs(z - spec.z) <= half;
      });

    const pillar = (x, z, top) => {
      const targetGroup = x <= 0.1 ? pillarsWest : pillarsEast;
      const shaft = box(0.2, top - FLOOR, 0.2, M.concrete, x, (top + FLOOR) / 2, z);
      const cap = box(0.24, 0.05, 0.24, M.concreteDark, x, top - 0.02, z, { cast: false });
      targetGroup.add(shaft);
      targetGroup.add(cap);
      embeddedPillars.push({ shaft, cap, interior: !onWall(x, z) });
    };

    columnsA.forEach(([x, z]) => pillar(x, z, A.top));
    columnsB.forEach(([x, z]) => pillar(x, z, B.top));

    const beam = (w, d, x, z, top) => {
      slabAndShores.add(box(w, 0.24, d, M.concrete, x, top - 0.12, z));
    };

    [-4.4, -1.9, 0.6].forEach((x) => beam(0.18, 6.0, x, -1.4, A.top));
    [-4.4, -1.4, 1.6].forEach((z) => beam(5.0, 0.18, -1.9, z, A.top));
    [0.6, 2.5, 4.4].forEach((x) => beam(0.18, 6.0, x, -0.6, B.top));
    [-3.6, -0.6, 2.4].forEach((z) => beam(3.8, 0.18, 2.5, z, B.top));

    const slab = (w, d, x, z, top) => {
      slabAndShores.add(box(w + 0.24, 0.14, d + 0.24, M.slab, x, top + 0.07, z));
      const ribs = Math.floor(w / 0.44);
      for (let i = 1; i < ribs; i += 1) {
        const offset = -(w / 2) + i * 0.44;
        slabAndShores.add(
          box(0.08, 0.07, d + 0.1, M.concreteDark, x + offset, top - 0.005, z, { cast: false })
        );
      }
      slabAndShores.add(box(w + 0.3, 0.18, 0.04, M.wood, x, top + 0.05, z + d / 2 + 0.12));
      slabAndShores.add(box(w + 0.3, 0.18, 0.04, M.wood, x, top + 0.05, z - d / 2 - 0.12));
    };

    slab(5.0, 6.0, -1.9, -1.4, A.top);
    slab(3.8, 6.0, 2.5, -0.6, B.top);

    const shore = (x, z, top) => {
      slabAndShores.add(
        cylinder(0.034, top - FLOOR - 0.06, M.steel, x, (top + FLOOR) / 2, z, { segments: 8 })
      );
      slabAndShores.add(box(0.22, 0.03, 0.22, M.steel, x, FLOOR + 0.015, z, { cast: false }));
      slabAndShores.add(box(0.18, 0.05, 0.18, M.steel, x, top - 0.03, z, { cast: false }));
    };

    [-3.9, -1.9, 0.1].forEach((x) => {
      [-3.9, -1.4, 1.1].forEach((z) => shore(x, z, A.top));
    });
    [1.1, 2.5, 3.9].forEach((x) => {
      [-3.1, -0.6, 1.9].forEach((z) => shore(x, z, B.top));
    });

    add(slabAndShores, 3, 3, 3, false, "structure-slab-beams", true);
    add(pillarsWest, 3, 3, 6, true, "structure-pillars-west", true);
    add(pillarsEast, 3, 3, 6, true, "structure-pillars-east", true);
  };

  /* ---------------------------------------------------------------------
     ETAPA 04: Alvenaria por Fachada, Vergas/Contravergas, Tesouras & Telhado
     --------------------------------------------------------------------- */
  const masonryRoleGroups = {
    "wall-front-south": new THREE.Group(),
    "wall-back-north": new THREE.Group(),
    "wall-left-west": new THREE.Group(),
    "wall-right-east": new THREE.Group(),
    "wall-interior-core": new THREE.Group(),
  };

  const buildMasonry = () => {
    WALLS.forEach((spec) => {
      const brick = brickMaterial(spec.width, spec.height);
      const wallGroup = new THREE.Group();
      const shell = wall({
        width: spec.width,
        height: spec.height,
        thickness: 0.2,
        material: brick,
        openings: spec.openings,
      });
      wallGroup.add(shell);
      shell.traverse((node) => {
        if (node.isMesh) {
          wallSwaps.push({ mesh: node, brick, finish: M.plaster });
        }
      });

      // Vergas e contravergas de concreto armado explícitas nos vãos
      spec.openings.forEach((op) => {
        const spanW = op.x1 - op.x0 + 0.42;
        const cx = (op.x0 + op.x1) / 2;
        const lintel = box(spanW, 0.12, 0.215, M.concrete, cx, op.y1 + 0.06, 0, { cast: false });
        wallGroup.add(lintel);
        lintelMeshes.push(lintel);
        if (op.kind === "window" && op.y0 > 0.2) {
          const sillBeam = box(spanW, 0.1, 0.215, M.concrete, cx, op.y0 - 0.05, 0, { cast: false });
          wallGroup.add(sillBeam);
          lintelMeshes.push(sillBeam);
        }
      });

      place(wallGroup, spec);
      masonryRoleGroups[spec.explodeRole].add(wallGroup);
    });

    // Marquise frontal anexada à fachada sul
    const frontGroup = masonryRoleGroups["wall-front-south"];
    frontGroup.add(box(2.7, 0.14, 1.8, M.slab, -0.75, 2.64, 2.5));
    frontGroup.add(box(2.6, 0.04, 1.7, M.wood, -0.75, 2.55, 2.5, { cast: false }));
    frontGroup.add(box(2.8, 0.05, 1.94, M.roof, -0.75, 2.72, 2.5, { rx: 0.06 }));
    frontGroup.add(box(2.82, 0.09, 0.07, M.concrete, -0.75, 2.66, 3.45, { cast: false }));
    [-1.7, 0.2].forEach((x) => {
      frontGroup.add(box(0.05, 0.05, 0.7, M.steel, x, 2.52, 2.2, { cast: false }));
    });

    // Embasamento (socle) no núcleo
    const socle = (x0, x1, z0, z1) => {
      const w = x1 - x0 + 0.24;
      const d = z1 - z0 + 0.24;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      masonryRoleGroups["wall-interior-core"].add(
        box(w, 0.5, d, M.concreteDark, cx, 0.25, cz, { cast: false })
      );
      masonryRoleGroups["wall-interior-core"].add(
        box(w + 0.05, 0.07, d + 0.05, M.concrete, cx, 0.465, cz, { cast: false })
      );
    };
    socle(A.x0, A.x1, A.z0, A.z1);
    socle(B.x0, B.x1, B.z0, B.z1);

    Object.entries(masonryRoleGroups).forEach(([role, grp]) => {
      add(grp, 4, 4, 6, true, role, false);
    });

    // Tesouras e terças de madeira do telhado (roof-trusses)
    const trussesGroup = new THREE.Group();
    const eave = B.top + 0.22;
    const ridge = B.top + 0.52;
    [-3.1, -1.85, -0.6, 0.65, 1.9].forEach((z) => {
      trussesGroup.add(box(3.5, 0.07, 0.06, M.wood, 2.5, eave - 0.02, z, { cast: false }));
      trussesGroup.add(box(0.06, 0.32, 0.06, M.wood, 2.5, (eave + ridge) / 2, z, { cast: false }));
      trussesGroup.add(
        box(1.82, 0.06, 0.055, M.wood, 1.62, (eave + ridge) / 2, z, { rz: 0.16, cast: false })
      );
      trussesGroup.add(
        box(1.82, 0.06, 0.055, M.wood, 3.38, (eave + ridge) / 2, z, { rz: -0.16, cast: false })
      );
    });
    [-1.2, -0.5, 0.5, 1.2].forEach((dx) => {
      trussesGroup.add(box(0.05, 0.05, 5.8, M.woodDark, 2.5 + dx, eave + 0.12, -0.6, { cast: false }));
    });
    add(trussesGroup, 4, 4, 6, false, "roof-trusses", true);

    // Lajes de cobertura, platibandas, telhas cerâmicas e rufos (roof-tiles-parapet)
    const roofCoverGroup = new THREE.Group();
    roofCoverGroup.add(box(5.16, 0.14, 6.16, M.slab, -1.9, A.top + 0.07, -1.4, { cast: false }));
    roofCoverGroup.add(box(3.94, 0.16, 6.16, M.slab, 2.5, B.top + 0.08, -0.6, { cast: false }));

    const parapet = (x0, x1, z0, z1, base, height, thickness = 0.22) => {
      const t = thickness;
      const top = base + height;
      const capH = 0.08;
      roofCoverGroup.add(box(x1 - x0 + t, height, t, M.paint, (x0 + x1) / 2, base + height / 2, z0));
      roofCoverGroup.add(box(x1 - x0 + t, height, t, M.paint, (x0 + x1) / 2, base + height / 2, z1));
      roofCoverGroup.add(box(t, height, z1 - z0 + t, M.paint, x0, base + height / 2, (z0 + z1) / 2));
      roofCoverGroup.add(box(t, height, z1 - z0 + t, M.paint, x1, base + height / 2, (z0 + z1) / 2));
      roofCoverGroup.add(
        box(x1 - x0 + t + 0.12, capH, t + 0.12, M.concrete, (x0 + x1) / 2, top + capH / 2, z0, {
          cast: false,
        })
      );
      roofCoverGroup.add(
        box(x1 - x0 + t + 0.12, capH, t + 0.12, M.concrete, (x0 + x1) / 2, top + capH / 2, z1, {
          cast: false,
        })
      );
      roofCoverGroup.add(
        box(t + 0.12, capH, z1 - z0 + t, M.concrete, x0, top + capH / 2, (z0 + z1) / 2, {
          cast: false,
        })
      );
      roofCoverGroup.add(
        box(t + 0.12, capH, z1 - z0 + t, M.concrete, x1, top + capH / 2, (z0 + z1) / 2, {
          cast: false,
        })
      );
    };

    parapet(A.x0 - 0.02, A.x1 + 0.02, A.z0 - 0.02, A.z1 + 0.02, A.top + 0.14, 0.6);
    parapet(B.x0 + 0.04, B.x1 + 0.06, B.z0 - 0.02, B.z1 + 0.02, B.top + 0.16, 0.66);

    const half = 1.72;
    const pitch = Math.atan2(ridge - eave, half);
    const panelLength = Math.hypot(half, ridge - eave) + 0.26;
    const roofZ = -0.6;

    roofCoverGroup.add(
      box(panelLength, 0.08, 5.96, M.roof, 2.5 - half / 2, (eave + ridge) / 2, roofZ, { rz: pitch })
    );
    roofCoverGroup.add(
      box(panelLength, 0.08, 5.96, M.roof, 2.5 + half / 2, (eave + ridge) / 2, roofZ, { rz: -pitch })
    );
    roofCoverGroup.add(box(0.18, 0.09, 5.98, M.black, 2.5, ridge + 0.03, roofZ));
    roofCoverGroup.add(box(0.14, 0.05, 6.0, M.alu, B.x0 + 0.22, eave + 0.01, roofZ, { cast: false }));
    roofCoverGroup.add(box(0.14, 0.05, 6.0, M.alu, B.x1 - 0.18, eave + 0.01, roofZ, { cast: false }));

    add(roofCoverGroup, 4, 4, 6, false, "roof-tiles-parapet", false);
  };

  /* ---------------------------------------------------------------------
     ETAPA 05: Instalações Elétricas (QDC) & Hidráulicas, Porcelanato e Esquadrias
     --------------------------------------------------------------------- */
  const decorForWall = (spec, build) => {
    const group = new THREE.Group();
    build(group);
    place(group, spec);
    return group;
  };

  const buildFinishes = () => {
    const finishRoleGroups = {
      "wall-front-south": new THREE.Group(),
      "wall-back-north": new THREE.Group(),
      "wall-left-west": new THREE.Group(),
      "wall-right-east": new THREE.Group(),
      "wall-interior-core": new THREE.Group(),
    };

    WALLS.forEach((spec) => {
      const wallDecor = decorForWall(spec, (local) => {
        spec.openings.forEach((opening) => {
          const w = opening.x1 - opening.x0;
          const h = opening.y1 - opening.y0;
          const cx = (opening.x0 + opening.x1) / 2;
          const cy = (opening.y0 + opening.y1) / 2;
          const border = 0.07;
          const depth = 0.26;

          local.add(box(w, border, depth, M.alu, cx, opening.y1 - border / 2, 0));
          local.add(box(w, border, depth, M.alu, cx, opening.y0 + border / 2, 0));
          local.add(box(border, h, depth, M.alu, opening.x0 + border / 2, cy, 0));
          local.add(box(border, h, depth, M.alu, opening.x1 - border / 2, cy, 0));
          if (w > 1.4) {
            local.add(box(0.055, h - border * 2, depth * 0.92, M.alu, cx, cy, 0));
          }
          if (h > 1.25) {
            local.add(box(w - border * 1.4, 0.045, depth * 0.9, M.alu, cx, cy + h * 0.12, 0));
          }

          if (opening.kind === "window") {
            local.add(box(w + 0.18, 0.055, 0.32, M.sill, cx, opening.y0 - 0.015, 0));
            local.add(
              box(w + 0.18, 0.045, 0.1, M.sill, cx, opening.y0 - 0.065, 0.15, { cast: false })
            );
          } else {
            local.add(box(w + 0.16, 0.045, 0.36, M.sill, cx, 0.028, 0));
          }
          local.add(
            box(w + 0.26, 0.05, 0.12, M.concrete, cx, opening.y1 + 0.075, 0.14, { cast: false })
          );

          if (opening.kind === "door") {
            const leafW = w - 0.12;
            const leafH = h - 0.06;
            local.add(box(leafW, leafH, 0.07, M.wood, cx, opening.y0 + leafH / 2, 0.03));
            const panelH = (leafH - 0.18) / 3;
            for (let p = 0; p < 3; p += 1) {
              local.add(
                box(
                  leafW * 0.62,
                  panelH - 0.05,
                  0.022,
                  M.woodDark,
                  cx,
                  opening.y0 + 0.09 + panelH / 2 + p * panelH,
                  0.075,
                  { cast: false }
                )
              );
            }
            local.add(box(0.035, 0.3, 0.07, M.gold, opening.x1 - 0.16, cy, 0.09));
          } else {
            local.add(
              box(w - border * 2, h - border * 2, 0.016, M.glass, cx, cy, 0, { cast: false })
            );
          }
        });

        const baseOpenings = spec.openings
          .filter((opening) => opening.y0 < 0.2)
          .sort((a, b) => a.x0 - b.x0);
        let cursor = -spec.width / 2;
        const segments = [];
        baseOpenings.forEach((opening) => {
          if (opening.x0 > cursor) segments.push([cursor, opening.x0]);
          cursor = Math.max(cursor, opening.x1);
        });
        if (cursor < spec.width / 2) segments.push([cursor, spec.width / 2]);
        segments.forEach(([x0, x1]) => {
          if (x1 - x0 < 0.12) return;
          [0.112, -0.112].forEach((z) => {
            local.add(box(x1 - x0, 0.18, 0.03, M.baseboard, (x0 + x1) / 2, 0.09, z, { cast: false }));
          });
        });
      });
      finishRoleGroups[spec.explodeRole].add(wallDecor);
    });

    Object.entries(finishRoleGroups).forEach(([role, grp]) => {
      add(grp, 5, 5, 6, false, role, false);
    });

    // Piso interno e varanda em porcelanato (floor-porcelain)
    const porcelainGroup = new THREE.Group();
    porcelainGroup.add(box(4.78, 0.035, 5.78, M.porcelain, -1.9, 0.518, -1.4, { cast: false }));
    porcelainGroup.add(box(3.58, 0.035, 5.78, M.porcelain, 2.5, 0.518, -0.6, { cast: false }));
    porcelainGroup.add(box(2.9, 0.045, 1.65, M.porcelain, -0.7, 0.535, 2.42, { cast: false }));
    porcelainGroup.add(box(2.9, 0.055, 0.1, M.concrete, -0.7, 0.51, 3.25, { cast: false }));
    porcelainGroup.add(box(3.1, 0.12, 0.6, M.concrete, -0.7, 0.44, 3.55, { cast: false }));
    porcelainGroup.add(box(3.1, 0.04, 0.6, M.porcelain, -0.7, 0.52, 3.55, { cast: false }));
    add(porcelainGroup, 5, 5, 6, false, "floor-porcelain", true);

    // Prumadas hidrossanitárias e condensadora no setor oeste (mep-plumbing-west)
    const mepWest = new THREE.Group();
    const chase = standard({ color: 0x2f2d2a, roughness: 0.96, metalness: 0 });
    [
      { z: 0.95, r: 0.032, h: 2.35, material: M.water },
      { z: -2.45, r: 0.045, h: 2.25, material: M.sewage },
      { z: -0.95, r: 0.026, h: 2.1, material: M.water },
    ].forEach((pipe) => {
      mepWest.add(box(0.016, pipe.h + 0.14, 0.16, chase, -4.51, 1.62, pipe.z, { cast: false }));
      mepWest.add(cylinder(pipe.r, pipe.h, pipe.material, -4.52, 1.65, pipe.z, { segments: 10 }));
    });
    mepWest.add(box(0.32, 0.55, 0.72, M.paint, -4.6, 1.15, -0.7));
    mepWest.add(
      cylinder(0.2, 0.03, M.black, -4.77, 1.15, -0.7, {
        rz: Math.PI / 2,
        segments: 16,
        cast: false,
      })
    );
    add(mepWest, 5, 5, 5, false, "mep-plumbing-west", true);

    // QDC elétrico (disjuntores DR/DPS + eletrodutos) + brise e pedra (mep-electrical-brise-east)
    const mepEast = new THREE.Group();
    // Quadro de Distribuição de Circuitos (QDC NBR 5410)
    mepEast.add(box(0.08, 0.48, 0.36, M.alu, 4.52, 1.68, -1.85));
    mepEast.add(box(0.03, 0.12, 0.26, M.qdcBreaker, 4.56, 1.78, -1.85, { cast: false }));
    mepEast.add(box(0.03, 0.12, 0.26, M.gold, 4.56, 1.58, -1.85, { cast: false }));
    [-2.02, -1.85, -1.68].forEach((z) => {
      mepEast.add(cylinder(0.018, 1.35, M.conduit, 4.52, 2.45, z, { segments: 8, cast: false }));
    });
    // Pedra natural, brise ripado e calha pluvial
    mepEast.add(box(0.52, 2.9, 0.09, M.stone, 0.93, 1.45, B.z1 + 0.07));
    mepEast.add(box(0.58, 0.06, 0.13, M.gold, 0.93, 2.9, B.z1 + 0.07, { cast: false }));
    mepEast.add(box(0.9, 2.9, 0.04, M.woodDark, 3.98, 1.45, B.z1 + 0.02, { cast: false }));
    for (let i = 0; i < 10; i += 1) {
      mepEast.add(
        box(0.055, 2.84, 0.09, M.wood, 3.62 + i * 0.08, 1.42, B.z1 + 0.06, { cast: false })
      );
    }
    mepEast.add(cylinder(0.035, 3.1, M.alu, B.x1 + 0.06, 2.2, B.z1 + 0.06, { segments: 8 }));
    add(mepEast, 5, 5, 6, false, "mep-electrical-brise-east", true);
  };

  /* ---------------------------------------------------------------------
     ETAPA 06: Entrega das Chaves — Garagem, Muros, Paisagismo, Luzes & Chave
     --------------------------------------------------------------------- */
  const buildDelivery = () => {
    const group = new THREE.Group();

    group.add(box(3.7, 0.1, 5.2, M.paver, -2.85, 0.05, 3.6, { cast: false }));
    group.add(box(3.7, 0.24, 5.0, M.slab, -2.85, 2.76, 3.6));
    group.add(box(3.76, 0.2, 0.1, M.concrete, -2.85, 2.76, 6.05, { cast: false }));
    group.add(box(0.1, 0.2, 5.0, M.concrete, -4.68, 2.76, 3.6, { cast: false }));
    group.add(box(0.1, 0.2, 5.0, M.concrete, -1.02, 2.76, 3.6, { cast: false }));
    group.add(box(3.4, 0.05, 4.7, M.roof, -2.85, 2.9, 3.6, { cast: false }));

    [-4.35, -1.35].forEach((x) => {
      group.add(box(0.28, 2.62, 0.28, M.paint, x, 1.4, 5.85));
      group.add(box(0.36, 0.08, 0.36, M.concrete, x, 2.74, 5.85, { cast: false }));
      group.add(box(0.34, 0.14, 0.34, M.stone, x, 0.17, 5.85, { cast: false }));
    });
    group.add(box(0.26, 1.25, 4.7, M.stone, -4.55, 0.72, 3.6));
    group.add(box(0.34, 0.06, 4.8, M.concrete, -4.55, 1.37, 3.6, { cast: false }));

    const car = new THREE.Group();
    const carBody = standard({
      color: 0xb9bec6,
      metalness: 0.78,
      roughness: 0.28,
      envMapIntensity: 1.35,
    });
    const carDark = standard({ color: 0x1a1e24, metalness: 0.6, roughness: 0.4 });
    const carGlass = standard({
      color: 0x16212b,
      metalness: 0.5,
      roughness: 0.07,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 2.2,
    });
    car.add(box(1.82, 0.44, 4.15, carBody, 0, 0.62, 0));
    car.add(box(1.86, 0.2, 3.62, carBody, 0, 0.43, 0));
    car.add(box(1.7, 0.42, 2.05, carBody, 0, 1.0, -0.1));
    car.add(box(1.58, 0.34, 1.8, carGlass, 0, 1.08, -0.05, { cast: false }));
    [-1.32, 1.32].forEach((z) => {
      [-0.9, 0.9].forEach((x) => {
        car.add(cylinder(0.34, 0.22, carDark, x, 0.4, z, { rz: Math.PI / 2, segments: 16 }));
        car.add(
          cylinder(0.19, 0.24, M.steel, x, 0.4, z, { rz: Math.PI / 2, segments: 12, cast: false })
        );
      });
    });
    car.position.set(-2.85, 0.04, 3.6);
    car.rotation.y = 0.04;
    group.add(car);

    group.add(box(3.5, 0.06, 1.15, M.paver, -3.05, 0.035, 6.6, { cast: false }));
    group.add(box(1.6, 0.05, 4.55, M.paver, -0.6, 0.035, 3.85, { cast: false }));

    const fence = (w, d, x, z) => {
      group.add(box(w, 1.25, d, M.paint, x, 0.63, z));
      group.add(box(w + 0.06, 0.08, d + 0.06, M.concrete, x, 1.3, z, { cast: false }));
    };
    fence(1.4, 0.2, -5.3, 6.05);
    fence(6.0, 0.2, 3.0, 6.05);
    fence(0.2, 12.9, -6.0, -0.45);
    fence(0.2, 12.9, 6.0, -0.45);
    fence(12.0, 0.2, 0, -6.92);

    [-4.6, -1.5, -1.3, 0.0].forEach((x) => {
      group.add(box(0.36, 1.72, 0.36, M.paint, x, 0.86, 6.05));
      group.add(box(0.12, 0.05, 0.12, M.light, x, 1.81, 6.05, { cast: false }));
    });
    for (let i = 0; i < 7; i += 1) {
      group.add(box(0.035, 1.24, 0.035, M.black, -1.22 + i * 0.185, 0.68, 6.05, { cast: false }));
    }
    for (let i = 0; i < 12; i += 1) {
      group.add(box(0.04, 1.1, 0.04, M.black, -4.35 + i * 0.218, 0.71, 5.86, { cast: false }));
    }

    const shrub = standard({ color: 0x2f5136, roughness: 1 });
    const shrubLight = standard({ color: 0x477c4e, roughness: 1 });
    group.add(plane(5.3, 0.95, M.grass, 3.15, 0.026, 5.55));
    [
      [0.95, 5.55, 0.3],
      [1.9, 5.45, 0.34],
      [2.9, 5.52, 0.32],
      [3.9, 5.62, 0.28],
      [4.85, 5.5, 0.33],
    ].forEach(([x, z, r], idx) => {
      const bush = new THREE.Mesh(
        trackGeo(new THREE.IcosahedronGeometry(r, 1)),
        idx % 2 === 0 ? shrub : shrubLight
      );
      bush.position.set(x, r * 0.76, z);
      bush.userData.noCadEdges = true;
      bush.castShadow = true;
      group.add(bush);
    });

    const trunk = standard({ color: 0x5b4127, roughness: 0.95 });
    const leaves = standard({ color: 0x37603c, roughness: 0.95 });
    group.add(cylinder(0.14, 2.0, trunk, 5.0, 1.0, 4.55, { segments: 8 }));
    [
      [5.0, 2.8, 4.55, 0.92],
      [4.55, 2.6, 4.35, 0.62],
      [5.45, 2.65, 4.7, 0.64],
    ].forEach(([x, y, z, r]) => {
      const crown = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(r, 1)), leaves);
      crown.position.set(x, y, z);
      crown.userData.noCadEdges = true;
      crown.castShadow = true;
      group.add(crown);
    });

    group.add(box(1.7, 0.05, 0.06, M.light, -0.6, 2.5, 3.16, { cast: false }));

    WALLS.forEach((spec) => {
      if (!spec.openings.some((opening) => opening.kind === "window")) return;
      const glow = new THREE.Group();
      spec.openings.forEach((opening) => {
        if (opening.kind !== "window") return;
        const w = opening.x1 - opening.x0;
        const h = opening.y1 - opening.y0;
        glow.add(
          box(
            w - 0.14,
            h - 0.14,
            0.02,
            M.warmGlass,
            (opening.x0 + opening.x1) / 2,
            (opening.y0 + opening.y1) / 2,
            -0.055,
            { cast: false, receive: false, noCadEdges: true }
          )
        );
      });
      place(glow, spec);
      group.add(glow);
    });

    add(group, 6, 6, 6, false, "delivery-garage-south", false);

    // Chave dourada flutuante (delivery-key)
    const key = new THREE.Group();
    const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.16, 0.035, 12, 24)), M.key);
    ring.userData.noCadEdges = true;
    key.add(ring);
    key.add(box(0.05, 0.42, 0.05, M.key, 0, -0.36, 0, { cast: false }));
    key.add(box(0.16, 0.035, 0.035, M.key, 0.06, -0.52, 0, { cast: false }));
    key.add(box(0.11, 0.035, 0.035, M.key, 0.045, -0.42, 0, { cast: false }));
    key.position.set(0.75, 2.2, 3.55);
    key.rotation.z = -0.25;
    const keyLight = new THREE.PointLight(0xffd08a, 5.5, 4.5, 2);
    keyLight.position.set(0, 0, 0.4);
    key.add(keyLight);
    add(key, 6, 6, 6, false, "delivery-key", false);
    return key;
  };

  buildTerrain();
  buildFoundation();
  buildStructure();
  buildMasonry();
  buildFinishes();
  const keyMarker = buildDelivery();

  // Plano horizontal de Laser Scan (varre verticalmente a etapa ativa no modo Holograma CAD)
  const scanTex = canvasTex(128, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = "rgba(56, 189, 248, 0.09)";
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, w - 4);
    ctx.strokeStyle = "rgba(226, 197, 138, 0.32)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const p = (i / 4) * w;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, w);
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }
  });
  const scanMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: scanTex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const scanPlaneMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(11.4, 11.4)), scanMat);
  scanPlaneMesh.rotation.x = -Math.PI / 2;
  scanPlaneMesh.position.set(-0.2, 0.35, -0.5);
  scanPlaneMesh.renderOrder = 6;
  root.add(scanPlaneMesh);

  // Linhas-guia tracejadas holográficas para a Vista Explodida Omnidirecional
  const guideRoleKeys = Object.keys(ROLE_ANCHORS);
  const guidePositions = new Float32Array(guideRoleKeys.length * 6);
  const guideGeo = trackGeo(new THREE.BufferGeometry());
  guideGeo.setAttribute("position", new THREE.BufferAttribute(guidePositions, 3));
  const guideMat = trackMat(
    new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.28,
      gapSize: 0.18,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    })
  );
  const guideLines = new THREE.LineSegments(guideGeo, guideMat);
  guideLines.visible = false;
  guideLines.frustumCulled = false;
  root.add(guideLines);

  // Iluminação solar arquitetônica + mapa de ambiente procedural
  const hemisphere = new THREE.HemisphereLight(0xd7e6ff, 0x2a3026, 1.18);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff1d6, 3.05);
  sun.position.set(14, 22, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 65;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xb8d0f0, 0.75);
  fill.position.set(-12, 8, -9);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd9a0, 0.6);
  rim.position.set(-9, 5, 13);
  scene.add(rim);

  const envCanvas = document.createElement("canvas");
  envCanvas.width = 256;
  envCanvas.height = 128;
  const envCtx = envCanvas.getContext("2d");
  const envGradient = envCtx.createLinearGradient(0, 0, 0, 128);
  envGradient.addColorStop(0, "#5d7fa8");
  envGradient.addColorStop(0.5, "#cdd8e2");
  envGradient.addColorStop(0.62, "#8f8b80");
  envGradient.addColorStop(1, "#3b3a34");
  envCtx.fillStyle = envGradient;
  envCtx.fillRect(0, 0, 256, 128);
  const envTexture = new THREE.CanvasTexture(envCanvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;
  envTexture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envTexture);
  scene.environment = envRT.texture;
  envTexture.dispose();
  pmrem.dispose();

  // Câmera orbital + compensação automática de explosão
  const BASE_VIEW = { theta: 0.82, phi: 1.03, radius: 30.5 };
  const view = { ...BASE_VIEW };
  const goal = { ...BASE_VIEW };
  const focus = new THREE.Vector3(0, -0.15, 0);
  const MIN_RADIUS = 17.5;
  const MAX_RADIUS = 48;
  const MAX_RADIUS_EXPLODED = 64;
  let fitScale = 1;

  const fitToAspect = () => {
    const aspect = camera.aspect || 1;
    const next = clamp(Math.sqrt(1.5 / Math.max(aspect, 0.52)), 1, 1.55);
    const ratio = next / fitScale;
    fitScale = next;
    goal.radius = clamp(goal.radius * ratio, MIN_RADIUS, MAX_RADIUS);
    view.radius = clamp(view.radius * ratio, MIN_RADIUS, MAX_RADIUS);
  };

  let currentStage = 0;
  let subProgressTarget = 0.25;
  let subProgressCurrent = 0.25;
  let explodeTarget = 0;
  let explodeCurrent = 0;
  let renderMode = "hologram";
  let autoRotate = !reducedMotion;
  const startedAt = now();
  const AUTO_ROTATE_BUDGET_MS = 3800;

  let disposed = false;
  let visible = true;
  let frameQueued = false;
  let rafId = null;

  const updateCamera = () => {
    view.theta = lerp(view.theta, goal.theta, 0.18);
    view.phi = lerp(view.phi, goal.phi, 0.18);
    view.radius = lerp(view.radius, goal.radius, 0.16);
    focus.y = lerp(-0.15, 0.65, explodeCurrent);

    const effectiveRadius = Math.min(
      MAX_RADIUS_EXPLODED,
      view.radius * (1 + 0.36 * explodeCurrent)
    );
    const height = Math.cos(view.phi) * effectiveRadius;
    const flat = Math.sin(view.phi) * effectiveRadius;
    camera.position.set(
      focus.x + flat * Math.sin(view.theta),
      focus.y + height,
      focus.z + flat * Math.cos(view.theta)
    );
    camera.lookAt(focus);
  };

  const syncCadModeVisibility = () => {
    const showCad = renderMode === "hologram";
    cadEdgeLines.forEach(({ line, stage }) => {
      line.visible = showCad;
      if (showCad) {
        line.material = stage === currentStage ? cadCurrentMat : cadBuiltMat;
      }
    });
    scanPlaneMesh.visible = showCad && explodeCurrent < 0.15;
  };

  const syncItemVisibilityForStageAndExplosion = (animateNew = true) => {
    const isExploded = explodeCurrent > 0.02 || explodeTarget > 0.02;
    let index = 0;

    registry.forEach((item) => {
      const withinStage =
        item.stage <= currentStage &&
        (currentStage <= item.until || (isExploded && item.showInExplosion));

      if (withinStage) {
        if (item.shown) return;
        item.shown = true;
        item.obj.visible = true;
        if (!animateNew || reducedMotion) {
          item.obj.scale.setScalar(1);
          item.mats.forEach((mat) => {
            mat.opacity = mat.userData.baseOpacity;
          });
          return;
        }
        if (item.grow) {
          item.obj.scale.set(1, 0.76, 1);
        } else {
          item.obj.scale.setScalar(0.965);
        }
        item.mats.forEach((mat) => {
          mat.userData.baseTransparent = mat.transparent;
          mat.userData.baseDepthWrite = mat.depthWrite;
          mat.transparent = true;
          mat.depthWrite = false;
          mat.opacity = 0;
        });
        tweens.push({
          item,
          delay: index * 22,
          duration: 540,
          started: now(),
        });
        index += 1;
      } else if (item.shown) {
        item.shown = false;
        item.obj.visible = false;
        for (let i = tweens.length - 1; i >= 0; i -= 1) {
          if (tweens[i].item === item) tweens.splice(i, 1);
        }
      }
    });

    wallSwaps.forEach(({ mesh, brick, finish }) => {
      mesh.material = currentStage >= 5 ? finish : brick;
      const item = mesh.userData.item;
      if (item) item.mats = [mesh.material];
    });

    // Vergas aparentes na Etapa 04 ou durante vista explodida; rebocadas na Etapa 05+
    lintelMeshes.forEach((lintel) => {
      lintel.material = currentStage >= 5 && !isExploded ? M.plaster : M.concrete;
    });

    const embedded = currentStage >= 4 && !isExploded;
    embeddedPillars.forEach(({ shaft, cap, interior }) => {
      const hide = embedded && interior;
      shaft.visible = !hide;
      cap.visible = !hide;
      const s = embedded ? 0.6 : 1;
      shaft.scale.set(s, 1, s);
      cap.scale.set(s, 1, s);
      shaft.material = embedded ? M.plaster : M.concrete;
      cap.material = embedded ? M.plaster : M.concreteDark;
    });

    syncCadModeVisibility();
    sun.shadow.needsUpdate = true;
  };

  const updateGuideLines = () => {
    if (explodeCurrent <= 0.02) {
      guideLines.visible = false;
      return;
    }
    guideLines.visible = true;
    const posAttr = guideGeo.getAttribute("position");
    const arr = posAttr.array;

    guideRoleKeys.forEach((role, idx) => {
      const base = ROLE_ANCHORS[role];
      const vec = EXPLODE_VECTORS[role] || [0, 0, 0];
      const roleActive = registry.some((it) => it.explodeRole === role && it.obj.visible);
      const scale = roleActive ? explodeCurrent : 0;
      const offset = idx * 6;
      arr[offset] = base[0];
      arr[offset + 1] = base[1];
      arr[offset + 2] = base[2];
      arr[offset + 3] = base[0] + vec[0] * scale;
      arr[offset + 4] = base[1] + vec[1] * scale;
      arr[offset + 5] = base[2] + vec[2] * scale;
    });
    posAttr.needsUpdate = true;
    guideLines.computeLineDistances();
  };

  function invalidate() {
    if (disposed || frameQueued || !visible || document.hidden) return;
    frameQueued = true;
    rafId = window.requestAnimationFrame(renderFrame);
  }

  function renderFrame() {
    frameQueued = false;
    rafId = null;
    if (disposed || !visible || document.hidden) return;

    const nowTime = now();
    const elapsedMs = nowTime - startedAt;
    let keepAnimating = false;

    if (autoRotate && !dragging && elapsedMs < AUTO_ROTATE_BUDGET_MS) {
      goal.theta += 0.0014;
      keepAnimating = true;
    } else if (autoRotate && elapsedMs >= AUTO_ROTATE_BUDGET_MS) {
      autoRotate = false;
    }

    for (let i = tweens.length - 1; i >= 0; i -= 1) {
      const tween = tweens[i];
      const progress = clamp((nowTime - tween.started - tween.delay) / tween.duration, 0, 1);
      const eased = easeOutCubic(progress);
      if (tween.item.grow) {
        tween.item.obj.scale.set(1, lerp(0.76, 1, eased), 1);
      } else {
        tween.item.obj.scale.setScalar(lerp(0.965, 1, eased));
      }
      tween.item.mats.forEach((mat) => {
        mat.opacity = mat.userData.baseOpacity * eased;
      });
      if (progress >= 1) {
        tween.item.obj.scale.setScalar(1);
        tween.item.mats.forEach((mat) => {
          mat.opacity = mat.userData.baseOpacity;
          if (mat.userData.baseTransparent !== undefined) {
            mat.transparent = mat.userData.baseTransparent;
          }
          if (mat.userData.baseDepthWrite !== undefined) {
            mat.depthWrite = mat.userData.baseDepthWrite;
          }
        });
        tweens.splice(i, 1);
      } else {
        keepAnimating = true;
      }
    }

    const prevExplode = explodeCurrent;
    explodeCurrent = lerp(explodeCurrent, explodeTarget, reducedMotion ? 1 : 0.14);
    if (Math.abs(explodeCurrent - explodeTarget) < 0.0008) {
      explodeCurrent = explodeTarget;
    } else {
      keepAnimating = true;
    }

    if ((prevExplode <= 0.02) !== (explodeCurrent <= 0.02)) {
      syncItemVisibilityForStageAndExplosion(false);
    }

    registry.forEach((item) => {
      item.obj.position.set(
        item.basePos.x + item.explodeVec.x * explodeCurrent,
        item.basePos.y + item.explodeVec.y * explodeCurrent,
        item.basePos.z + item.explodeVec.z * explodeCurrent
      );
    });
    updateGuideLines();

    subProgressCurrent = lerp(subProgressCurrent, subProgressTarget, reducedMotion ? 1 : 0.22);
    if (Math.abs(subProgressCurrent - subProgressTarget) < 0.001) {
      subProgressCurrent = subProgressTarget;
    } else {
      keepAnimating = true;
    }

    const [yMin, yMax] = STAGE_HEIGHT_RANGES[currentStage] || [0, 3.5];
    scanPlaneMesh.position.y = lerp(yMin, yMax, subProgressCurrent);
    syncCadModeVisibility();

    if (keyMarker && currentStage === 6) {
      keyMarker.rotation.y = 0.35 + subProgressCurrent * 0.4;
    }

    const prevTheta = view.theta;
    const prevPhi = view.phi;
    const prevRadius = view.radius;
    updateCamera();

    const camMoving =
      Math.abs(view.theta - goal.theta) > 0.0006 ||
      Math.abs(view.phi - goal.phi) > 0.0006 ||
      Math.abs(view.radius - goal.radius) > 0.002 ||
      Math.abs(view.theta - prevTheta) > 0.0004 ||
      Math.abs(view.phi - prevPhi) > 0.0004 ||
      Math.abs(view.radius - prevRadius) > 0.001;
    if (camMoving) keepAnimating = true;

    sun.shadow.needsUpdate =
      tweens.length > 0 || Math.abs(explodeCurrent - prevExplode) > 0.0004;

    renderer.render(scene, camera);

    if (keepAnimating) {
      invalidate();
    }
  }

  const setStage = (order, subProgress = subProgressTarget) => {
    const nextStage = clamp(Math.round(Number(order) || 1), 1, 6);
    if (Number.isFinite(subProgress)) {
      subProgressTarget = clamp(Number(subProgress), 0, 1);
    }
    if (nextStage !== currentStage) {
      currentStage = nextStage;
      syncItemVisibilityForStageAndExplosion(true);
      document.documentElement.dataset.obraStage = String(currentStage);
    }
    invalidate();
  };

  // Controles de ponteiro, roda, vistas rápidas e resize com AbortController
  const abortController = new AbortController();
  const { signal } = abortController;
  const canvas = renderer.domElement;

  let armed = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let activePointer = null;
  const pointers = new Map();
  let pinchDistance = 0;

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      armed = true;
      autoRotate = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [first, second] = [...pointers.values()];
        pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
        dragging = false;
        return;
      }
      dragging = true;
      activePointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_err) {
        // Ignora ponteiros sintéticos sem captura
      }
      invalidate();
    },
    { signal }
  );

  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [first, second] = [...pointers.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (pinchDistance > 0 && distance > 0) {
          goal.radius = clamp(goal.radius * (pinchDistance / distance), MIN_RADIUS, MAX_RADIUS);
          invalidate();
        }
        pinchDistance = distance;
        return;
      }

      if (!dragging || event.pointerId !== activePointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      goal.theta -= dx * 0.0065;
      goal.phi = clamp(goal.phi - dy * 0.0055, 0.42, 1.34);
      invalidate();
    },
    { signal }
  );

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (event.pointerId === activePointer) {
      dragging = false;
      activePointer = null;
    }
  };
  canvas.addEventListener("pointerup", endPointer, { signal });
  canvas.addEventListener("pointercancel", endPointer, { signal });
  canvas.addEventListener(
    "pointerleave",
    () => {
      armed = false;
    },
    { signal }
  );

  canvas.addEventListener(
    "wheel",
    (event) => {
      const free = event.ctrlKey || event.metaKey || event.shiftKey || armed;
      if (!free) return;
      event.preventDefault();
      const step = Math.exp(clamp(event.deltaY, -60, 60) * 0.0022);
      goal.radius = clamp(goal.radius * step, MIN_RADIUS, MAX_RADIUS);
      invalidate();
    },
    { passive: false, signal }
  );

  const buttons = Array.from(wrap.querySelectorAll("[data-view-action]"));
  const VIEW_ACTIONS = new Set(["front", "side", "top", "iso"]);
  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const action = button.dataset.viewAction;
        const fitting = (value) => clamp(value * fitScale, MIN_RADIUS, MAX_RADIUS);
        if (action === "zoom-in") {
          goal.radius = clamp(goal.radius * 0.82, MIN_RADIUS, MAX_RADIUS);
        } else if (action === "zoom-out") {
          goal.radius = clamp(goal.radius * 1.22, MIN_RADIUS, MAX_RADIUS);
        } else if (action === "reset") {
          goal.theta = BASE_VIEW.theta;
          goal.phi = BASE_VIEW.phi;
          goal.radius = fitting(BASE_VIEW.radius);
        } else if (action === "front") {
          goal.theta = 0.14;
          goal.phi = 1.16;
          goal.radius = fitting(28.5);
        } else if (action === "side") {
          goal.theta = Math.PI / 2 - 0.06;
          goal.phi = 1.13;
          goal.radius = fitting(29);
        } else if (action === "top") {
          goal.theta = 0.58;
          goal.phi = 0.5;
          goal.radius = fitting(40.5);
        } else if (action === "iso") {
          goal.theta = BASE_VIEW.theta;
          goal.phi = BASE_VIEW.phi;
          goal.radius = fitting(BASE_VIEW.radius);
        }

        if (VIEW_ACTIONS.has(action)) {
          buttons.forEach((other) => {
            const active = other === button;
            other.classList.toggle("is-active", active);
            other.setAttribute("aria-pressed", String(active));
          });
        } else {
          buttons.forEach((other) => {
            other.classList.remove("is-active");
            if (VIEW_ACTIONS.has(other.dataset.viewAction)) {
              other.setAttribute("aria-pressed", "false");
            }
          });
        }
        autoRotate = false;
        if (action !== "zoom-in" && action !== "zoom-out") armed = false;
        invalidate();
      },
      { signal }
    );
  });

  // Resize estritamente com updateStyle = false (CSP style-src-attr 'none')
  const resize = () => {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    fitToAspect();
    invalidate();
  };

  let resizeObserver = null;
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else {
    window.addEventListener("resize", resize, { passive: true, signal });
  }
  resize();

  let visibilityObserver = null;
  if ("IntersectionObserver" in window) {
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) invalidate();
      },
      { rootMargin: "150px 0px", threshold: 0.01 }
    );
    visibilityObserver.observe(wrap);
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) invalidate();
    },
    { signal }
  );

  document.addEventListener(
    "rocha:etapa-3d",
    (event) => {
      const detail = event.detail || {};
      setStage(detail.order, detail.subProgress);
    },
    { signal }
  );

  document.addEventListener(
    "rocha:explodir-3d",
    (event) => {
      explodeTarget = event.detail && event.detail.exploded ? 1 : 0;
      syncItemVisibilityForStageAndExplosion(false);
      invalidate();
    },
    { signal }
  );

  document.addEventListener(
    "rocha:modo-3d",
    (event) => {
      renderMode = event.detail?.mode === "realistic" ? "realistic" : "hologram";
      syncCadModeVisibility();
      invalidate();
    },
    { signal }
  );

  document.body.addEventListener("htmx:afterSwap", resize, { signal });

  // Sincroniza estado inicial com o DOM ativo
  const modeBtn = document.getElementById("toggle-render-mode");
  if (modeBtn?.dataset.renderMode === "realistic") {
    renderMode = "realistic";
  }
  const explodeBtn = document.getElementById("toggle-exploded-3d");
  if (explodeBtn?.getAttribute("aria-pressed") === "true") {
    explodeTarget = 1;
    explodeCurrent = 1;
  }
  const activeCard = document.querySelector(".stage-step-card.is-active[data-stage-order]");
  const storedStage = Number(document.documentElement.dataset.obraStage);
  setStage(
    Number.isFinite(storedStage) && storedStage > 0
      ? storedStage
      : Number(activeCard?.getAttribute("data-stage-order")) || 1,
    0.25
  );

  updateCamera();
  invalidate();

  window.__rochaMaquete = {
    scene,
    camera,
    renderer,
    view,
    goal,
    focus,
    setStage,
    invalidate,
    getStage: () => currentStage,
    getExplode: () => explodeCurrent,
    getRenderMode: () => renderMode,
    setAutoRotate: (value) => {
      autoRotate = Boolean(value);
      if (autoRotate) invalidate();
    },
  };

  return () => {
    if (disposed) return;
    disposed = true;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    abortController.abort();
    if (resizeObserver) resizeObserver.disconnect();
    if (visibilityObserver) visibilityObserver.disconnect();

    tweens.length = 0;
    registry.length = 0;
    wallSwaps.length = 0;
    lintelMeshes.length = 0;
    embeddedPillars.length = 0;
    cadEdgeLines.length = 0;

    scene.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat) => mat.dispose());
      }
    });

    trackedGeometries.forEach((geo) => geo.dispose());
    trackedGeometries.clear();
    trackedMaterials.forEach((mat) => mat.dispose());
    trackedMaterials.clear();
    trackedTextures.forEach((t) => t.dispose());
    trackedTextures.clear();

    if (envRT) envRT.dispose();
    scene.environment = null;
    scene.clear();

    if (renderer.renderLists) {
      renderer.renderLists.dispose();
    }
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    wrap.classList.remove("has-webgl");
    if (window.__rochaMaquete?.renderer === renderer) {
      delete window.__rochaMaquete;
    }
  };
}

/**
 * Monta idempotentemente a maquete WebGL Three.js quando `#iso-webgl` está presente.
 */
export function mountObraScene() {
  if (activeCleanupFn || mountPending) return;
  const host = document.getElementById("iso-webgl");
  const wrap = document.getElementById("iso-scene-wrap");
  if (!host || !wrap) return;

  const source =
    host.dataset.threeUrl ||
    new URL("../../vendor/three/three.module.min.js", import.meta.url).href;

  mountPending = true;
  import(source)
    .then((THREE) => {
      mountPending = false;
      const liveHost = document.getElementById("iso-webgl");
      const liveWrap = document.getElementById("iso-scene-wrap");
      if (!liveHost || !liveWrap || activeCleanupFn) return;
      activeCleanupFn = createSceneInstance(THREE, liveHost, liveWrap);
    })
    .catch((error) => {
      mountPending = false;
      console.warn("[Maquete 3D] Three.js não carregado:", error);
    });
}

/**
 * Libera 100% da memória GPU, texturas procedurais, listeners e contexto WebGL.
 */
export function disposeObraScene() {
  mountPending = false;
  if (activeCleanupFn) {
    const fn = activeCleanupFn;
    activeCleanupFn = null;
    fn();
  }
}
