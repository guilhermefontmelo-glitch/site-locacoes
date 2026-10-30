/**
 * Maquete 3D arquitetônica (Three.js) — Residência MCMV de padrão elevado
 * ---------------------------------------------------------------------------
 * Cena real com materiais procedurais, iluminação solar, sombras, órbita 360°,
 * zoom e vista explodida — sincronizada às 6 etapas do cronograma físico.
 *
 * Integração: ouve "rocha:etapa-3d" e "rocha:explodir-3d" (scene3d-obra.js).
 * Falha silenciosa: se WebGL/Three indisponível, a maquete CSS continua ativa.
 */

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const now = () => performance.now();

/* Texturas procedurais determinísticas (mesmo desenho em toda visita) */
let seed = 20261030;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const boot = () => {
  const host = document.getElementById("iso-webgl");
  const wrap = document.getElementById("iso-scene-wrap");
  if (!host || !wrap) return;

  const source =
    host.dataset.threeUrl ||
    new URL("../../vendor/three/three.module.min.js", import.meta.url).href;

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    import(source)
      .then((THREE) => init(THREE, host, wrap))
      .catch((error) => {
        console.warn("[Maquete 3D] Three.js indisponível:", error);
      });
  };

  if ("IntersectionObserver" in window) {
    const fallback = window.setTimeout(start, 1600);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          window.clearTimeout(fallback);
          start();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(wrap);
  } else {
    start();
  }
};

const canvasTex = (THREE, size, draw, srgb = true) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/* Normal map derivado da luminância de uma textura de altura (grayscale) */
const normalFromCanvas = (THREE, canvas, strength = 2.4) => {
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
    const i = (yi * size + xi) * 4;
    return (
      (source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114) / 255
    );
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
  const texture = new THREE.CanvasTexture(out);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

const buildTextures = (THREE, maxAniso) => {
  const tex = {};

  tex.paver = canvasTex(THREE, 256, (ctx, w) => {
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

  tex.grass = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#3d5a3f";
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i += 1) {
      const g = 60 + Math.floor(rnd() * 70);
      ctx.fillStyle = `rgba(${g - 18}, ${g + 28}, ${g - 12}, ${0.25 + rnd() * 0.4})`;
      ctx.fillRect(rnd() * w, rnd() * w, 2, 2 + rnd() * 3);
    }
  });

  tex.concrete = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#b7b7b2";
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 900; i += 1) {
      const v = 150 + Math.floor(rnd() * 70);
      ctx.fillStyle = `rgba(${v}, ${v}, ${v - 4}, ${0.12 + rnd() * 0.2})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * w, 0.6 + rnd() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  tex.brick = canvasTex(THREE, 256, (ctx, w) => {
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
        ctx.fillRect(
          c * brickW + offset + 2,
          r * rowH + 2,
          brickW - 4,
          rowH - 4,
        );
      }
    }
  });

  tex.stone = canvasTex(THREE, 256, (ctx, w) => {
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

  tex.wood = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#6d4a2f";
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 46; i += 1) {
      const x = rnd() * w;
      ctx.strokeStyle = `rgba(${40 + rnd() * 40}, ${26 + rnd() * 26}, ${16 + rnd() * 18}, ${0.18 + rnd() * 0.4})`;
      ctx.lineWidth = 0.8 + rnd() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 6, w * 0.33, x - 6, w * 0.66, x + 3, w);
      ctx.stroke();
    }
  });

  tex.roof = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#7a2f22";
    ctx.fillRect(0, 0, w, w);
    const rows = 6;
    const rowH = w / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const tone = 118 + Math.floor(rnd() * 38);
        ctx.fillStyle = `rgb(${tone}, ${Math.round(tone * 0.42)}, ${Math.round(tone * 0.32)})`;
        ctx.beginPath();
        ctx.roundRect(
          c * (w / 8) + 1,
          r * rowH + 1,
          w / 8 - 2,
          rowH - 2,
          6,
        );
        ctx.fill();
      }
      ctx.fillStyle = "rgba(35, 12, 8, 0.28)";
      ctx.fillRect(0, (r + 1) * rowH - 3, w, 3);
    }
  });

  tex.porcelain = canvasTex(THREE, 256, (ctx, w) => {
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

  tex.dirt = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#6b503a";
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i += 1) {
      const v = 70 + Math.floor(rnd() * 70);
      ctx.fillStyle = `rgba(${v + 24}, ${v}, ${v - 14}, ${0.2 + rnd() * 0.35})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * w, 0.7 + rnd() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  tex.gravel = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#9c968c";
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 1200; i += 1) {
      const v = 120 + Math.floor(rnd() * 90);
      ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 12}, ${0.4 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * w, 0.8 + rnd() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  tex.plaster = canvasTex(THREE, 256, (ctx, w) => {
    ctx.fillStyle = "#e9e2d6";
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 2400; i += 1) {
      const v = 204 + Math.floor(rnd() * 40);
      ctx.fillStyle = `rgba(${v}, ${v - 5}, ${v - 14}, ${0.07 + rnd() * 0.15})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * w, 0.5 + rnd() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  /* Rugosidade sutil compartilhada (variação fina de micro-textura) */
  tex.microRough = canvasTex(
    THREE,
    256,
    (ctx, w) => {
      ctx.fillStyle = "#d6d6d6";
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 1600; i += 1) {
        const v = 184 + Math.floor(rnd() * 64);
        ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${0.12 + rnd() * 0.3})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * w, 1 + rnd() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );

  tex.plasterNormal = normalFromCanvas(THREE, tex.plaster.image, 1.1);
  tex.concreteNormal = normalFromCanvas(THREE, tex.concrete.image, 1.4);
  tex.gravelNormal = normalFromCanvas(THREE, tex.gravel.image, 2.2);
  tex.grassNormal = normalFromCanvas(THREE, tex.grass.image, 1.6);
  tex.paverNormal = normalFromCanvas(THREE, tex.paver.image, 2.2);
  tex.woodNormal = normalFromCanvas(THREE, tex.wood.image, 2.6);
  tex.stoneNormal = normalFromCanvas(THREE, tex.stone.image, 3.2);
  tex.porcelainNormal = normalFromCanvas(THREE, tex.porcelain.image, 1.8);
  tex.roofNormal = normalFromCanvas(THREE, tex.roof.image, 2.8);

  Object.values(tex).forEach((texture) => {
    texture.anisotropy = maxAniso;
  });
  return tex;
};

const init = (THREE, host, wrap) => {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (error) {
    console.warn("[Maquete 3D] WebGL não disponível:", error);
    return;
  }

  /* Garante nitidez mesmo com zoom-out do navegador (DPR < 1) e limita a 2x */
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1), 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  wrap.classList.add("has-webgl");

  const tex = buildTextures(THREE, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 220);

  const root = new THREE.Group();
  scene.add(root);

  const layerGroups = {};
  for (let layer = 1; layer <= 6; layer += 1) {
    const group = new THREE.Group();
    layerGroups[layer] = group;
    root.add(group);
  }

  /* Deslocamento vertical de cada camada no modo explodido */
  const LAYER_LIFT = { 1: 0, 2: 0.55, 3: 1.35, 4: 2.25, 5: 3.15, 6: 0 };

  /* ---------------------------------------------------------------------
     Materiais procedurais (cada parede recebe repetição coerente à escala)
     --------------------------------------------------------------------- */
  const standard = (options) => {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.02,
      envMapIntensity: 0.75,
      ...options,
    });
    material.userData.baseOpacity = material.opacity;
    return material;
  };

  const repeatTexture = (source, repeatX, repeatY) => {
    const texture = source.clone();
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
    water: standard({
      color: 0x3d7f9e,
      metalness: 0.35,
      roughness: 0.45,
    }),
    conduit: standard({ color: 0xd06a2c, roughness: 0.6 }),
    key: standard({
      color: 0xe6c273,
      metalness: 1,
      roughness: 0.18,
      emissive: 0x8a6520,
      emissiveIntensity: 0.9,
    }),
  };

  /* Sombra de contato "baked" (decal radial) para assentar os volumes no solo */
  const contactTexture = canvasTex(
    THREE,
    256,
    (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      const gradient = ctx.createRadialGradient(
        w / 2,
        w / 2,
        w * 0.04,
        w / 2,
        w / 2,
        w * 0.5,
      );
      gradient.addColorStop(0, "rgba(6, 9, 12, 0.6)");
      gradient.addColorStop(0.52, "rgba(6, 9, 12, 0.3)");
      gradient.addColorStop(1, "rgba(6, 9, 12, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, w);
    },
    false,
  );
  contactTexture.wrapS = THREE.ClampToEdgeWrapping;
  contactTexture.wrapT = THREE.ClampToEdgeWrapping;
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: contactTexture,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    toneMapped: false,
  });

  const brickMaterial = (width, height) =>
    mapped(tex.brick, Math.max(1, width / 1.1), Math.max(1, height / 1.1), {
      roughness: 0.95,
    });

  const registry = [];
  const tweens = [];
  const wallSwaps = [];

  const collectMaterials = (object) => {
    const list = [];
    object.traverse((node) => {
      if (!node.material) return;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((material) => {
        if (!list.includes(material)) list.push(material);
      });
    });
    return list;
  };

  const add = (mesh, stage, layer = stage) => {
    const item = {
      obj: mesh,
      stage,
      layer,
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (options.rx) mesh.rotation.x = options.rx;
    if (options.ry) mesh.rotation.y = options.ry;
    if (options.rz) mesh.rotation.z = options.rz;
    mesh.castShadow = options.cast !== false;
    mesh.receiveShadow = options.receive !== false;
    return mesh;
  };

  const plane = (w, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  };

  const cylinder = (radius, height, material, x, y, z, options = {}) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, options.segments || 14),
      material,
    );
    mesh.position.set(x, y, z);
    if (options.rx) mesh.rotation.x = options.rx;
    if (options.rz) mesh.rotation.z = options.rz;
    mesh.castShadow = options.cast !== false;
    mesh.receiveShadow = true;
    return mesh;
  };

  /* Parede com vãos reais recortados (portas e janelas) */
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
      group.add(
        box(
          x1 - x0,
          height,
          thickness,
          material,
          (x0 + x1) / 2,
          height / 2,
          0,
        ),
      );
    });

    sorted.forEach((opening) => {
      const w = opening.x1 - opening.x0;
      const cx = (opening.x0 + opening.x1) / 2;
      if (opening.y0 > 0.01) {
        group.add(
          box(w, opening.y0, thickness, material, cx, opening.y0 / 2, 0),
        );
      }
      if (opening.y1 < height - 0.01) {
        group.add(
          box(
            w,
            height - opening.y1,
            thickness,
            material,
            cx,
            (opening.y1 + height) / 2,
            0,
          ),
        );
      }
    });
    return group;
  };

  /* ---------------------------------------------------------------------
     Terreno, implantação e gabarito (ETAPA 01)
     --------------------------------------------------------------------- */
  const FLOOR = 0.5;
  const A = { x0: -4.4, x1: 0.6, z0: -4.4, z1: 1.6, top: 2.9 };
  const B = { x0: 0.6, x1: 4.4, z0: -3.6, z1: 2.4, top: 3.4 };

  const buildTerrain = () => {
    const group = new THREE.Group();

    /* Base fina com bisel, laterais de solo e oclusão de contato */
    group.add(
      box(13.9, 0.1, 15.9, M.plinth, 0, -0.34, 0, {
        cast: false,
        receive: false,
      }),
    );
    group.add(box(13.55, 0.3, 15.55, M.soil, 0, -0.16, 0, { cast: false }));
    group.add(
      box(13.46, 0.03, 15.46, M.plinthEdge, 0, -0.006, 0, {
        cast: false,
        receive: false,
      }),
    );
    group.add(plane(12, 14, M.gravel, 0, 0.012, 0));

    /* Faixas de grama nas divisas */
    group.add(plane(0.55, 14, M.grass, -5.72, 0.02, 0));
    group.add(plane(0.55, 14, M.grass, 5.72, 0.02, 0));
    group.add(plane(12, 0.6, M.grass, 0, 0.02, -6.7));

    /* Calçada pública + guia */
    group.add(plane(12, 1.0, M.sidewalk, 0, 0.025, 6.6));
    group.add(box(12, 0.12, 0.16, M.concrete, 0, 0.07, 7.12, { cast: false }));

    /* Oclusão ambiente "baked" sob a edificação */
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(11.6, 10.6),
      contactMaterial,
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(-0.9, 0.032, -0.95);
    contact.renderOrder = 1;
    group.add(contact);

    /* Gabarito de implantação: eixos e locação da obra */
    const gridTexture = canvasTex(THREE, 256, (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      ctx.strokeStyle = "rgba(226, 197, 138, 0.85)";
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
    });
    const gridMaterial = standard({
      map: gridTexture,
      transparent: true,
      opacity: 0.5,
      roughness: 1,
      metalness: 0,
      emissive: 0x6d5525,
      emissiveIntensity: 0.35,
      depthWrite: false,
    });
    gridMaterial.map.repeat.set(2, 2);
    const grid = plane(9.4, 7.6, gridMaterial, -1.9, 0.042, -0.9);
    grid.receiveShadow = false;
    group.add(grid);

    /* Piquetes e linhas de marcação */
    const stakeMat = M.wood;
    const stringMat = standard({
      color: 0xe8c46a,
      emissive: 0x6b4d18,
      emissiveIntensity: 0.55,
      roughness: 0.8,
    });
    const corners = [
      [A.x0 - 0.3, A.z0 - 0.3],
      [A.x1 + 0.3, A.z0 - 0.3],
      [B.x1 + 0.3, B.z1 + 0.3],
      [A.x0 - 0.3, A.z1 + 0.3],
    ];
    corners.forEach(([x, z]) => {
      group.add(cylinder(0.028, 0.62, stakeMat, x, 0.31, z, { segments: 6 }));
    });
    const stringY = 0.55;
    group.add(
      box(
        0.018,
        0.018,
        corners[0][1] - corners[3][1],
        stringMat,
        corners[0][0],
        stringY,
        (corners[0][1] + corners[3][1]) / 2,
        { cast: false },
      ),
    );
    group.add(
      box(
        0.018,
        0.018,
        corners[0][1] - corners[3][1],
        stringMat,
        corners[1][0],
        stringY,
        (corners[0][1] + corners[3][1]) / 2,
        { cast: false },
      ),
    );
    group.add(
      box(
        corners[1][0] - corners[0][0],
        0.018,
        0.018,
        stringMat,
        (corners[0][0] + corners[1][0]) / 2,
        stringY,
        corners[0][1],
        { cast: false },
      ),
    );
    group.add(
      box(
        corners[1][0] - corners[0][0],
        0.018,
        0.018,
        stringMat,
        (corners[0][0] + corners[1][0]) / 2,
        stringY,
        corners[3][1],
        { cast: false },
      ),
    );

    add(group, 1, 1);
  };

  /* ---------------------------------------------------------------------
     Fundação: escavação, sapatas, baldrames e impermeabilização (ETAPA 02)
     --------------------------------------------------------------------- */
  const columnsA = [
    [-4.4, -4.4], [-1.9, -4.4], [0.6, -4.4],
    [-4.4, -1.4], [-1.9, -1.4], [0.6, -1.4],
    [-4.4, 1.6], [-1.9, 1.6], [0.6, 1.6],
  ];
  const columnsB = [
    [0.6, -3.6], [2.5, -3.6], [4.4, -3.6],
    [0.6, -0.6], [2.5, -0.6], [4.4, -0.6],
    [0.6, 2.4], [2.5, 2.4], [4.4, 2.4],
  ];

  const buildFoundation = () => {
    const group = new THREE.Group();
    const columns = [...columnsA, ...columnsB];

    columns.forEach(([x, z]) => {
      group.add(box(0.86, 0.16, 0.86, M.dirt, x, 0.09, z, { cast: false }));
      group.add(box(0.58, 0.26, 0.58, M.concreteDark, x, 0.26, z));
      group.add(box(0.26, 0.16, 0.26, M.concrete, x, 0.42, z));
    });

    const baldrame = (w, d, x, z) => {
      group.add(box(w, 0.32, d, M.concrete, x, 0.34, z));
      group.add(
        box(w + 0.04, 0.025, d + 0.04, M.black, x, 0.51, z, {
          cast: false,
        }),
      );
    };

    baldrame(5.2, 0.26, -1.9, -4.4);
    baldrame(5.2, 0.26, -1.9, 1.6);
    baldrame(0.26, 6.2, -4.4, -1.4);
    baldrame(0.26, 6.2, 0.6, -1.4);
    baldrame(3.8, 0.26, 2.5, -3.6);
    baldrame(3.8, 0.26, 2.5, 2.4);
    baldrame(0.26, 6.2, 4.4, -0.6);

    /* Contrapiso interno nivelado */
    group.add(box(4.9, 0.1, 5.9, M.concreteDark, -1.9, 0.5, -1.4, {
      cast: false,
    }));
    group.add(box(3.7, 0.1, 5.9, M.concreteDark, 2.5, 0.5, -0.6, {
      cast: false,
    }));

    add(group, 2, 2);
  };

  /* ---------------------------------------------------------------------
     Estrutura: pilares, vigas, escoramento e laje (ETAPA 03)
     --------------------------------------------------------------------- */
  const buildStructure = () => {
    const group = new THREE.Group();

    const pillar = (x, z, top) => {
      group.add(box(0.2, top - FLOOR, 0.2, M.concrete, x, (top + FLOOR) / 2, z));
      /* Armadura aparente no topo do pilar (conceitual) */
      group.add(box(0.24, 0.05, 0.24, M.concreteDark, x, top - 0.02, z, {
        cast: false,
      }));
    };

    columnsA.forEach(([x, z]) => pillar(x, z, A.top));
    columnsB.forEach(([x, z]) => pillar(x, z, B.top));

    const beam = (w, d, x, z, top) => {
      group.add(box(w, 0.24, d, M.concrete, x, top - 0.12, z));
    };

    [-4.4, -1.9, 0.6].forEach((x) => beam(0.18, 6.0, x, -1.4, A.top));
    [-4.4, -1.4, 1.6].forEach((z) => beam(5.0, 0.18, -1.9, z, A.top));
    [0.6, 2.5, 4.4].forEach((x) => beam(0.18, 6.0, x, -0.6, B.top));
    [-3.6, -0.6, 2.4].forEach((z) => beam(3.8, 0.18, 2.5, z, B.top));

    const slab = (w, d, x, z, top, ribsAlongX) => {
      group.add(box(w + 0.24, 0.14, d + 0.24, M.slab, x, top + 0.07, z));
      const ribs = Math.floor((ribsAlongX ? d : w) / 0.42);
      for (let i = 1; i < ribs; i += 1) {
        const offset = -((ribsAlongX ? d : w) / 2) + i * 0.42;
        if (ribsAlongX) {
          group.add(
            box(w + 0.1, 0.07, 0.08, M.concreteDark, x, top - 0.005, z + offset, {
              cast: false,
            }),
          );
        } else {
          group.add(
            box(0.08, 0.07, d + 0.1, M.concreteDark, x + offset, top - 0.005, z, {
              cast: false,
            }),
          );
        }
      }
      /* Formas de madeira no perímetro */
      group.add(box(w + 0.3, 0.18, 0.04, M.wood, x, top + 0.05, z + d / 2 + 0.12));
      group.add(box(w + 0.3, 0.18, 0.04, M.wood, x, top + 0.05, z - d / 2 - 0.12));
    };

    slab(5.0, 6.0, -1.9, -1.4, A.top, false);
    slab(3.8, 6.0, 2.5, -0.6, B.top, false);

    /* Escoramento metálico sob as lajes */
    const shore = (x, z, top) => {
      group.add(cylinder(0.034, top - FLOOR - 0.06, M.steel, x, (top + FLOOR) / 2, z, {
        segments: 8,
      }));
      group.add(box(0.22, 0.03, 0.22, M.steel, x, FLOOR + 0.015, z, {
        cast: false,
      }));
      group.add(box(0.18, 0.05, 0.18, M.steel, x, top - 0.03, z, {
        cast: false,
      }));
    };

    [-3.9, -1.9, 0.1].forEach((x) => {
      [-3.9, -1.4, 1.1].forEach((z) => shore(x, z, A.top));
    });
    [1.1, 2.5, 3.9].forEach((x) => {
      [-3.1, -0.6, 1.9].forEach((z) => shore(x, z, B.top));
    });

    add(group, 3, 3);
  };

  /* ---------------------------------------------------------------------
     Alvenaria, vergas, platibandas e cobertura cerâmica (ETAPA 04)
     --------------------------------------------------------------------- */
  const WALLS = [
    {
      id: "A-frente",
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
      x: -1.9,
      z: A.z0,
      width: 5.0,
      height: 2.4,
      ry: 0,
      openings: [{ x0: -0.9, x1: 0.7, y0: 0.95, y1: 1.95, kind: "window" }],
    },
    {
      id: "A-esquerda",
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
      x: 2.5,
      z: B.z1,
      width: 3.8,
      height: 2.9,
      ry: 0,
      openings: [{ x0: -1.3, x1: 1.05, y0: 0.85, y1: 2.15, kind: "window" }],
    },
    {
      id: "B-fundo",
      x: 2.5,
      z: B.z0,
      width: 3.8,
      height: 2.9,
      ry: 0,
      openings: [{ x0: -0.95, x1: 0.65, y0: 0.95, y1: 1.95, kind: "window" }],
    },
    {
      id: "B-direita",
      x: B.x1,
      z: -0.6,
      width: 6.0,
      height: 2.9,
      ry: Math.PI / 2,
      openings: [{ x0: -1.0, x1: 0.9, y0: 0.95, y1: 2.05, kind: "window" }],
    },
    {
      id: "A-divisa",
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

  const buildMasonry = () => {
    const group = new THREE.Group();

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

      spec.openings.forEach((opening) => {
        const w = opening.x1 - opening.x0;
        const cx = (opening.x0 + opening.x1) / 2;
        wallGroup.add(
          box(w + 0.34, 0.09, 0.26, M.concrete, cx, opening.y1 + 0.045, 0, {
            cast: false,
          }),
        );
        if (opening.y0 > 0.05) {
          wallGroup.add(
            box(w + 0.34, 0.08, 0.26, M.concrete, cx, opening.y0 - 0.04, 0, {
              cast: false,
            }),
          );
        }
      });

      place(wallGroup, spec);
      group.add(wallGroup);
    });

    /* Laje de forro + platibanda contínua e espessa (oculta as águas) */
    group.add(
      box(5.16, 0.14, 6.16, M.slab, -1.9, A.top + 0.07, -1.4, { cast: false }),
    );
    group.add(
      box(3.94, 0.16, 6.16, M.slab, 2.5, B.top + 0.08, -0.6, { cast: false }),
    );

    const parapet = (x0, x1, z0, z1, base, height, thickness = 0.22) => {
      const t = thickness;
      const top = base + height;
      const capH = 0.08;
      group.add(box(x1 - x0 + t, height, t, M.paint, (x0 + x1) / 2, base + height / 2, z0));
      group.add(box(x1 - x0 + t, height, t, M.paint, (x0 + x1) / 2, base + height / 2, z1));
      group.add(box(t, height, z1 - z0 + t, M.paint, x0, base + height / 2, (z0 + z1) / 2));
      group.add(box(t, height, z1 - z0 + t, M.paint, x1, base + height / 2, (z0 + z1) / 2));
      /* Capeamento contínuo com pingadeira saliente */
      group.add(box(x1 - x0 + t + 0.12, capH, t + 0.12, M.concrete, (x0 + x1) / 2, top + capH / 2, z0, { cast: false }));
      group.add(box(x1 - x0 + t + 0.12, capH, t + 0.12, M.concrete, (x0 + x1) / 2, top + capH / 2, z1, { cast: false }));
      group.add(box(t + 0.12, capH, z1 - z0 + t, M.concrete, x0, top + capH / 2, (z0 + z1) / 2, { cast: false }));
      group.add(box(t + 0.12, capH, z1 - z0 + t, M.concrete, x1, top + capH / 2, (z0 + z1) / 2, { cast: false }));
      /* Friso de sombra na base da platibanda */
      group.add(box(x1 - x0 + t + 0.04, 0.035, t + 0.04, M.concreteDark, (x0 + x1) / 2, base + 0.05, z0, { cast: false }));
      group.add(box(x1 - x0 + t + 0.04, 0.035, t + 0.04, M.concreteDark, (x0 + x1) / 2, base + 0.05, z1, { cast: false }));
    };

    parapet(A.x0 - 0.02, A.x1 + 0.02, A.z0 - 0.02, A.z1 + 0.02, A.top + 0.14, 0.6);
    parapet(B.x0 + 0.04, B.x1 + 0.06, B.z0 - 0.02, B.z1 + 0.02, B.top + 0.16, 0.66);

    /* Telha cerâmica embutida no volume B (visível de cima, oculta de lado) */
    const eave = B.top + 0.22;
    const ridge = B.top + 0.5;
    const half = 1.72;
    const pitch = Math.atan2(ridge - eave, half);
    const panelLength = Math.hypot(half, ridge - eave) + 0.26;
    const roofZ = -0.6;

    group.add(
      box(panelLength, 0.08, 5.96, M.roof, 2.5 - half / 2, (eave + ridge) / 2, roofZ, {
        rz: pitch,
      }),
    );
    group.add(
      box(panelLength, 0.08, 5.96, M.roof, 2.5 + half / 2, (eave + ridge) / 2, roofZ, {
        rz: -pitch,
      }),
    );
    group.add(box(0.18, 0.09, 5.98, M.black, 2.5, ridge + 0.03, roofZ));
    /* Rufos metálicos nas águas */
    group.add(box(0.14, 0.05, 6.0, M.alu, B.x0 + 0.22, eave + 0.01, roofZ, { cast: false }));
    group.add(box(0.14, 0.05, 6.0, M.alu, B.x1 - 0.18, eave + 0.01, roofZ, { cast: false }));

    /* Marquise de entrada com beiral cerâmico */
    group.add(box(2.7, 0.14, 1.8, M.slab, -0.75, 2.64, 2.5));
    group.add(box(2.6, 0.04, 1.7, M.wood, -0.75, 2.55, 2.5, { cast: false }));
    group.add(box(2.8, 0.05, 1.94, M.roof, -0.75, 2.72, 2.5, { rx: 0.06 }));
    group.add(box(2.82, 0.09, 0.07, M.concrete, -0.75, 2.66, 3.45, { cast: false }));
    /* Mãos-francesas de apoio */
    [-1.7, 0.2].forEach((x) => {
      group.add(box(0.05, 0.05, 0.7, M.steel, x, 2.52, 2.2, { cast: false }));
    });

    add(group, 4, 4);
  };

  /* ---------------------------------------------------------------------
     Instalações, esquadrias e revestimentos (ETAPA 05)
     --------------------------------------------------------------------- */
  const decorForWall = (spec, build) => {
    const group = new THREE.Group();
    build(group);
    place(group, spec);
    return group;
  };

  const buildFinishes = () => {
    const group = new THREE.Group();

    WALLS.forEach((spec) => {
      const wallDecor = decorForWall(spec, (local) => {
        spec.openings.forEach((opening) => {
          const w = opening.x1 - opening.x0;
          const h = opening.y1 - opening.y0;
          const cx = (opening.x0 + opening.x1) / 2;
          const cy = (opening.y0 + opening.y1) / 2;
          const border = 0.07;
          const depth = 0.26;

          /* Marco de alumínio escuro, embutido na espessura da parede */
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

          /* Peitoril, soleira e pingadeira */
          if (opening.kind === "window") {
            local.add(box(w + 0.18, 0.055, 0.32, M.sill, cx, opening.y0 - 0.015, 0));
            local.add(box(w + 0.18, 0.045, 0.1, M.sill, cx, opening.y0 - 0.065, 0.15, { cast: false }));
          } else {
            local.add(box(w + 0.16, 0.045, 0.36, M.sill, cx, 0.028, 0));
          }
          local.add(box(w + 0.26, 0.05, 0.12, M.concrete, cx, opening.y1 + 0.075, 0.14, { cast: false }));
          local.add(box(w + 0.26, 0.05, 0.12, M.concrete, cx, opening.y1 + 0.075, -0.14, { cast: false }));

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
                  { cast: false },
                ),
              );
            }
            local.add(box(0.035, 0.3, 0.07, M.gold, opening.x1 - 0.16, cy, 0.09));
          } else {
            const glass = box(
              w - border * 2,
              h - border * 2,
              0.016,
              M.glass,
              cx,
              cy,
              0,
              { cast: false },
            );
            local.add(glass);
          }
        });

        /* Rodapé externo contínuo, interrompido apenas nos vãos de porta */
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
            local.add(
              box(x1 - x0, 0.18, 0.03, M.baseboard, (x0 + x1) / 2, 0.09, z, {
                cast: false,
              }),
            );
          });
        });
      });
      group.add(wallDecor);
    });

    /* Parede de destaque em pedra no volume social */
    group.add(box(0.52, 2.9, 0.09, M.stone, 0.93, 1.45, B.z1 + 0.07));
    group.add(box(0.58, 0.06, 0.13, M.gold, 0.93, 2.9, B.z1 + 0.07, { cast: false }));
    group.add(box(0.05, 2.9, 0.13, M.gold, 0.67, 1.45, B.z1 + 0.07, { cast: false }));
    group.add(box(0.05, 2.9, 0.13, M.gold, 1.19, 1.45, B.z1 + 0.07, { cast: false }));

    /* Painel de ripas de madeira no volume íntimo */
    group.add(box(0.9, 2.9, 0.04, M.woodDark, 3.98, 1.45, B.z1 + 0.02, { cast: false }));
    for (let i = 0; i < 10; i += 1) {
      group.add(
        box(0.055, 2.84, 0.09, M.wood, 3.62 + i * 0.08, 1.42, B.z1 + 0.06, {
          cast: false,
        }),
      );
    }

    /* Varanda em porcelanato com degrau e faixa de borda */
    group.add(box(2.9, 0.045, 1.65, M.porcelain, -0.7, 0.535, 2.42, { cast: false }));
    group.add(box(2.9, 0.055, 0.1, M.concrete, -0.7, 0.51, 3.25, { cast: false }));
    group.add(box(3.1, 0.12, 0.6, M.concrete, -0.7, 0.44, 3.55, { cast: false }));
    group.add(box(3.1, 0.04, 0.6, M.porcelain, -0.7, 0.52, 3.55, { cast: false }));

    /* Instalações hidráulicas e elétricas aparentes (conceitual) */
    const pipeRuns = [
      { x: -4.52, z: 0.95, radius: 0.036, height: 2.3, material: M.water },
      { x: -4.52, z: -2.45, radius: 0.05, height: 2.2, material: M.paint },
      { x: -4.52, z: 0.35, radius: 0.022, height: 2.6, material: M.conduit },
    ];
    pipeRuns.forEach((pipe) => {
      group.add(cylinder(pipe.radius, pipe.height, pipe.material, pipe.x, 1.65, pipe.z, { segments: 10 }));
    });
    group.add(box(0.09, 0.05, 0.3, M.conduit, -4.52, 2.9, 0.35, { cast: false }));
    group.add(box(0.26, 0.34, 0.16, M.paint, -4.56, 1.1, 0.9, { cast: false }));

    /* Condensadora de ar-condicionado */
    group.add(box(0.32, 0.55, 0.72, M.paint, -4.58, 1.15, -0.7));
    group.add(cylinder(0.2, 0.03, M.black, -4.75, 1.15, -0.7, { rz: Math.PI / 2, segments: 20, cast: false }));

    /* Calha e condutor de águas pluviais */
    group.add(cylinder(0.035, 3.1, M.alu, B.x1 + 0.06, 2.2, B.z1 + 0.06, { segments: 8 }));
    group.add(box(0.1, 0.18, 1.9, M.alu, B.x1 + 0.02, B.top + 0.1, 1.3, { cast: false }));

    add(group, 5, 4);
  };

  /* ---------------------------------------------------------------------
     Obra concluída: garagem, calçadas, muros, paisagismo e chaves (ETAPA 06)
     --------------------------------------------------------------------- */
  const buildDelivery = () => {
    const group = new THREE.Group();

    /* Garagem / carport — pilares robustos e laje espessa */
    group.add(box(3.7, 0.1, 5.2, M.paver, -2.85, 0.05, 3.6, { cast: false }));
    group.add(box(3.7, 0.24, 5.0, M.slab, -2.85, 2.76, 3.6));
    /* Faixa de arremate frontal e laterais da laje */
    group.add(box(3.76, 0.2, 0.1, M.concrete, -2.85, 2.76, 6.05, { cast: false }));
    group.add(box(0.1, 0.2, 5.0, M.concrete, -4.68, 2.76, 3.6, { cast: false }));
    group.add(box(0.1, 0.2, 5.0, M.concrete, -1.02, 2.76, 3.6, { cast: false }));
    /* Telha cerâmica embutida no topo (percebida na vista aérea) */
    group.add(box(3.4, 0.05, 4.7, M.roof, -2.85, 2.9, 3.6, { cast: false }));

    [-4.35, -1.35].forEach((x) => {
      group.add(box(0.28, 2.62, 0.28, M.paint, x, 1.4, 5.85));
      group.add(box(0.36, 0.08, 0.36, M.concrete, x, 2.74, 5.85, { cast: false }));
      group.add(box(0.34, 0.14, 0.34, M.stone, x, 0.17, 5.85, { cast: false }));
    });
    /* Parede lateral em pedra com capeamento */
    group.add(box(0.26, 1.25, 4.7, M.stone, -4.55, 0.72, 3.6));
    group.add(box(0.34, 0.06, 4.8, M.concrete, -4.55, 1.37, 3.6, { cast: false }));

    /* Veículo conceitual sob a cobertura */
    const car = new THREE.Group();
    const carBody = standard({
      color: 0xb9bec6,
      metalness: 0.78,
      roughness: 0.28,
      envMapIntensity: 1.35,
    });
    const carDark = standard({
      color: 0x1a1e24,
      metalness: 0.6,
      roughness: 0.4,
    });
    const carGlass = standard({
      color: 0x16212b,
      metalness: 0.5,
      roughness: 0.07,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 2.2,
    });
    /* Carroceria em volumes sobrepostos + capô e porta-malas */
    car.add(box(1.82, 0.44, 4.15, carBody, 0, 0.62, 0));
    car.add(box(1.86, 0.2, 3.62, carBody, 0, 0.43, 0));
    car.add(box(1.7, 0.42, 2.05, carBody, 0, 1.0, -0.1));
    car.add(box(1.58, 0.34, 1.8, carGlass, 0, 1.08, -0.05, { cast: false }));
    /* Para-brisa e vidro traseiro inclinados */
    car.add(box(1.52, 0.05, 0.88, carGlass, 0, 1.17, 0.8, { rx: -0.85, cast: false }));
    car.add(box(1.52, 0.05, 0.88, carGlass, 0, 1.17, -1.02, { rx: 0.85, cast: false }));
    car.add(box(1.56, 0.07, 1.15, carBody, 0, 1.26, -0.12));
    /* Faróis, lanternas e grade frontal */
    const tailLight = standard({
      color: 0x7a1d1d,
      emissive: 0x5a0f0f,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    });
    [-0.62, 0.62].forEach((x) => {
      car.add(box(0.34, 0.14, 0.05, M.light, x, 0.68, 2.08, { cast: false }));
      car.add(box(0.3, 0.12, 0.05, tailLight, x, 0.68, -2.08, { cast: false }));
    });
    car.add(box(0.72, 0.16, 0.05, carDark, 0, 0.66, 2.08, { cast: false }));
    car.add(box(0.5, 0.12, 0.04, M.steel, 0, 0.42, 2.1, { cast: false }));
    /* Rodas com aro e pneu */
    [-1.32, 1.32].forEach((z) => {
      [-0.9, 0.9].forEach((x) => {
        car.add(
          cylinder(0.34, 0.22, carDark, x, 0.4, z, {
            rz: Math.PI / 2,
            segments: 20,
          }),
        );
        car.add(
          cylinder(0.19, 0.24, M.steel, x, 0.4, z, {
            rz: Math.PI / 2,
            segments: 16,
            cast: false,
          }),
        );
        car.add(
          cylinder(0.06, 0.26, M.black, x, 0.4, z, {
            rz: Math.PI / 2,
            segments: 8,
            cast: false,
          }),
        );
      });
    });
    car.position.set(-2.85, 0.04, 3.6);
    car.rotation.y = 0.04;
    group.add(car);

    const carShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 5.2),
      contactMaterial,
    );
    carShadow.rotation.x = -Math.PI / 2;
    carShadow.position.set(-2.85, 0.108, 3.6);
    group.add(carShadow);

    /* Piso intertravado do acesso de veículos e passeio de pedestres */
    group.add(box(3.5, 0.06, 1.15, M.paver, -3.05, 0.035, 6.6, { cast: false }));
    group.add(box(1.6, 0.05, 4.55, M.paver, -0.6, 0.035, 3.85, { cast: false }));
    group.add(box(1.8, 0.1, 0.16, M.concrete, -0.6, 0.055, 6.12, { cast: false }));

    /* Muro de fechamento do terreno */
    const fence = (w, d, x, z) => {
      group.add(box(w, 1.25, d, M.paint, x, 0.63, z));
      group.add(box(w + 0.06, 0.08, d + 0.06, M.concrete, x, 1.3, z, { cast: false }));
    };
    fence(1.4, 0.2, -5.3, 6.05);
    fence(6.0, 0.2, 3.0, 6.05);
    fence(0.2, 12.9, -6.0, -0.45);
    fence(0.2, 12.9, 6.0, -0.45);
    fence(12.0, 0.2, 0, -6.92);

    /* Pilaretes com capeamento ao longo do muro */
    const pilaster = (x, z) => {
      group.add(box(0.36, 1.6, 0.36, M.paint, x, 0.8, z));
      group.add(box(0.44, 0.09, 0.44, M.concrete, x, 1.65, z, { cast: false }));
    };
    [-6.0, 2.2, 4.1].forEach((x) => pilaster(x, 6.05));
    [-6.0, -3.0, 0.0, 3.0, 6.0].forEach((x) => pilaster(x, -6.92));
    [-3.5, 0.0, 3.0].forEach((z) => {
      pilaster(-6.0, z);
      pilaster(6.0, z);
    });

    /* Pilares do portão */
    [-4.6, -1.5, -1.3, 0.0].forEach((x) => {
      group.add(box(0.36, 1.72, 0.36, M.paint, x, 0.86, 6.05));
      group.add(box(0.44, 0.09, 0.44, M.concrete, x, 1.76, 6.05, { cast: false }));
      group.add(box(0.12, 0.05, 0.12, M.light, x, 1.81, 6.05, { cast: false }));
    });

    /* Portão social em barras de alumínio — ritmo uniforme */
    for (let i = 0; i < 7; i += 1) {
      group.add(box(0.035, 1.24, 0.035, M.black, -1.22 + i * 0.185, 0.68, 6.05, { cast: false }));
    }
    group.add(box(1.2, 0.055, 0.055, M.black, -0.665, 1.3, 6.05, { cast: false }));
    group.add(box(1.2, 0.055, 0.055, M.black, -0.665, 0.12, 6.05, { cast: false }));
    group.add(box(0.06, 1.24, 0.06, M.black, -1.25, 0.68, 6.05, { cast: false }));

    /* Portão deslizante de veículos (recolhido) */
    group.add(box(2.7, 0.06, 0.05, M.black, -3.15, 1.26, 5.86, { cast: false }));
    group.add(box(2.7, 0.06, 0.05, M.black, -3.15, 0.16, 5.86, { cast: false }));
    for (let i = 0; i < 12; i += 1) {
      group.add(box(0.04, 1.1, 0.04, M.black, -4.35 + i * 0.218, 0.71, 5.86, { cast: false }));
    }

    /* Paisagismo — canteiro com borda, arbustos e árvore de copa volumétrica */
    const shrub = standard({ color: 0x2f5136, roughness: 1 });
    const shrubLight = standard({ color: 0x477c4e, roughness: 1 });
    const floor = plane(5.3, 0.95, M.grass, 3.15, 0.026, 5.55);
    floor.receiveShadow = true;
    group.add(floor);
    group.add(box(5.4, 0.12, 0.09, M.concrete, 3.15, 0.06, 6.03, { cast: false }));
    group.add(box(5.4, 0.12, 0.09, M.concrete, 3.15, 0.06, 5.07, { cast: false }));

    const bushSpots = [
      [0.95, 5.55, 0.3],
      [1.45, 5.62, 0.24],
      [1.9, 5.45, 0.34],
      [2.5, 5.6, 0.27],
      [3.2, 5.48, 0.35],
      [3.9, 5.62, 0.26],
      [4.55, 5.5, 0.33],
      [5.25, 5.6, 0.24],
    ];
    bushSpots.forEach(([x, z, r], index) => {
      const bush = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        index % 2 === 0 ? shrub : shrubLight,
      );
      bush.position.set(x, r * 0.76, z);
      bush.scale.set(1.12, 0.86, 1.02);
      bush.castShadow = true;
      bush.receiveShadow = true;
      group.add(bush);
    });

    const trunk = standard({ color: 0x5b4127, roughness: 0.95 });
    const leaves = standard({ color: 0x37603c, roughness: 0.95 });
    const leavesLight = standard({ color: 0x4a7d4e, roughness: 0.95 });
    group.add(cylinder(0.14, 2.0, trunk, 5.0, 1.0, 4.55, { segments: 10 }));
    group.add(cylinder(0.06, 1.0, trunk, 5.2, 1.85, 4.55, { rz: -0.5, segments: 6 }));
    group.add(cylinder(0.05, 1.0, trunk, 4.82, 1.9, 4.55, { rz: 0.6, segments: 6 }));
    const lobes = [
      [5.0, 2.8, 4.55, 0.95],
      [4.5, 2.6, 4.35, 0.62],
      [5.5, 2.65, 4.7, 0.66],
      [4.95, 2.45, 4.0, 0.56],
      [5.05, 3.2, 4.55, 0.6],
      [4.7, 3.0, 4.85, 0.5],
      [5.4, 3.05, 4.3, 0.52],
    ];
    lobes.forEach(([x, y, z, r], index) => {
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 2),
        index % 3 === 0 ? leavesLight : leaves,
      );
      crown.position.set(x, y, z);
      crown.scale.set(1.06, 0.92, 1.0);
      crown.castShadow = true;
      crown.receiveShadow = true;
      group.add(crown);
    });
    const treeShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      contactMaterial,
    );
    treeShadow.rotation.x = -Math.PI / 2;
    treeShadow.position.set(5.0, 0.05, 4.55);
    group.add(treeShadow);

    /* Iluminação externa */
    [-1.55, 1.7].forEach((z, index) => {
      group.add(cylinder(0.045, 0.62, M.black, 0.28 + index * 0.0, 0.31, z, { segments: 8 }));
      group.add(cylinder(0.055, 0.1, M.light, 0.28, 0.66, z, { segments: 10, cast: false }));
    });
    group.add(box(1.7, 0.05, 0.06, M.light, -0.6, 2.5, 3.16, { cast: false }));

    /* Luz interna percebida através dos vidros */
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
            { cast: false, receive: false },
          ),
        );
      });
      place(glow, spec);
      group.add(glow);
    });

    add(group, 6, 6);

    /* Chave dourada em suspensão — símbolo da entrega */
    const key = new THREE.Group();
    key.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 12, 26), M.key));
    key.add(box(0.05, 0.42, 0.05, M.key, 0, -0.36, 0, { cast: false }));
    key.add(box(0.16, 0.035, 0.035, M.key, 0.06, -0.52, 0, { cast: false }));
    key.add(box(0.11, 0.035, 0.035, M.key, 0.045, -0.42, 0, { cast: false }));
    key.position.set(0.75, 2.2, 3.55);
    key.rotation.z = -0.25;
    const keyLight = new THREE.PointLight(0xffd08a, 6, 4.5, 2);
    keyLight.position.set(0, 0, 0.4);
    key.add(keyLight);
    add(key, 6, 6);
    return key;
  };

  /* ---------------------------------------------------------------------
     Montagem da cena, iluminação e ambiente
     --------------------------------------------------------------------- */
  buildTerrain();
  buildFoundation();
  buildStructure();
  buildMasonry();
  buildFinishes();
  const keyMarker = buildDelivery();

  const hemisphere = new THREE.HemisphereLight(0xd7e6ff, 0x2a3026, 1.18);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff1d6, 3.05);
  sun.position.set(14, 22, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
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
  scene.environment = pmrem.fromEquirectangular(envTexture).texture;
  envTexture.dispose();
  pmrem.dispose();

  /* ---------------------------------------------------------------------
     Órbita 360°, zoom e enquadramento isométrico
     --------------------------------------------------------------------- */
  const BASE_VIEW = { theta: 0.82, phi: 1.03, radius: 30.5 };
  const view = { ...BASE_VIEW };
  const goal = { ...BASE_VIEW };
  const focus = new THREE.Vector3(0, -0.15, 0);
  const MIN_RADIUS = 17.5;
  const MAX_RADIUS = 47;
  let fitScale = 1;

  /* Compensa telas estreitas (celular em pé) para não cortar a maquete */
  const fitToAspect = () => {
    const aspect = camera.aspect || 1;
    const next = clamp(Math.sqrt(1.5 / Math.max(aspect, 0.52)), 1, 1.55);
    const ratio = next / fitScale;
    fitScale = next;
    goal.radius = clamp(goal.radius * ratio, MIN_RADIUS, MAX_RADIUS);
    view.radius = clamp(view.radius * ratio, MIN_RADIUS, MAX_RADIUS);
  };
  let autoRotate = !REDUCED;
  let armed = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let activePointer = null;
  const pointers = new Map();
  let pinchDistance = 0;

  const updateCamera = () => {
    view.theta = lerp(view.theta, goal.theta, 0.16);
    view.phi = lerp(view.phi, goal.phi, 0.16);
    view.radius = lerp(view.radius, goal.radius, 0.14);
    const height = Math.cos(view.phi) * view.radius;
    const flat = Math.sin(view.phi) * view.radius;
    camera.position.set(
      focus.x + flat * Math.sin(view.theta),
      focus.y + height,
      focus.z + flat * Math.cos(view.theta),
    );
    camera.lookAt(focus);
  };

  const canvas = renderer.domElement;

  canvas.addEventListener("pointerdown", (event) => {
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
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (pinchDistance > 0) {
        goal.radius = clamp(
          goal.radius * (pinchDistance / distance),
          MIN_RADIUS,
          MAX_RADIUS,
        );
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
  });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (event.pointerId === activePointer) {
      dragging = false;
      activePointer = null;
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener(
    "wheel",
    (event) => {
      const free = event.ctrlKey || event.metaKey || event.shiftKey || armed;
      if (!free) return;
      event.preventDefault();
      const step = Math.exp(clamp(event.deltaY, -60, 60) * 0.0022);
      goal.radius = clamp(goal.radius * step, MIN_RADIUS, MAX_RADIUS);
    },
    { passive: false },
  );

  canvas.addEventListener("pointerleave", () => {
    armed = false;
  });

  const buttons = Array.from(wrap.querySelectorAll("[data-view-action]"));
  const VIEW_ACTIONS = new Set(["front", "side", "top", "iso"]);
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
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
    });
  });

  /* ---------------------------------------------------------------------
     Revelação progressiva das etapas
     --------------------------------------------------------------------- */
  let currentStage = 0;
  let explodeTarget = 0;
  let explodeCurrent = 0;

  const setStage = (order) => {
    currentStage = clamp(Math.round(Number(order) || 1), 1, 6);

    let index = 0;
    registry.forEach((item) => {
      if (item.stage <= currentStage) {
        if (item.shown) return;
        item.shown = true;
        item.obj.visible = true;
        item.obj.scale.setScalar(0.965);
        item.mats.forEach((material) => {
          material.userData.baseTransparent = material.transparent;
          material.userData.baseDepthWrite = material.depthWrite;
          material.transparent = true;
          material.depthWrite = false;
          material.opacity = 0;
        });
        tweens.push({
          item,
          delay: REDUCED ? 0 : index * 24,
          duration: REDUCED ? 1 : 620,
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

    document.documentElement.dataset.obraStage = String(currentStage);
    sun.shadow.needsUpdate = true;
  };

  /* ---------------------------------------------------------------------
     Loop de animação
     --------------------------------------------------------------------- */
  let visible = true;
  const startedAt = now();

  const animate = () => {
    requestAnimationFrame(animate);
    if (!visible || document.hidden) return;

    const nowTime = now();
    const elapsed = (nowTime - startedAt) / 1000;

    if (autoRotate && !dragging) goal.theta += 0.0015;

    for (let i = tweens.length - 1; i >= 0; i -= 1) {
      const tween = tweens[i];
      const progress = clamp(
        (nowTime - tween.started - tween.delay) / tween.duration,
        0,
        1,
      );
      const eased = easeOutCubic(progress);
      tween.item.obj.scale.setScalar(lerp(0.965, 1, eased));
      tween.item.mats.forEach((material) => {
        material.opacity = material.userData.baseOpacity * eased;
      });
      if (progress >= 1) {
        tween.item.obj.scale.setScalar(1);
        tween.item.mats.forEach((material) => {
          material.opacity = material.userData.baseOpacity;
          material.transparent = material.userData.baseTransparent;
          material.depthWrite = material.userData.baseDepthWrite;
        });
        tweens.splice(i, 1);
      }
    }

    explodeCurrent = lerp(explodeCurrent, explodeTarget, 0.1);
    if (Math.abs(explodeCurrent - explodeTarget) < 0.001) {
      explodeCurrent = explodeTarget;
    }
    registry.forEach((item) => {
      item.obj.position.y = explodeCurrent * LAYER_LIFT[item.layer];
    });

    if (keyMarker) {
      keyMarker.rotation.y = elapsed * 0.7;
      keyMarker.position.y = 2.2 + Math.sin(elapsed * 1.6) * 0.07;
    }

    /* Sombras só são recalculadas quando a maquete muda */
    sun.shadow.needsUpdate =
      tweens.length > 0 ||
      Math.abs(explodeCurrent - explodeTarget) > 0.0005;

    updateCamera();
    renderer.render(scene, camera);
  };

  /* ---------------------------------------------------------------------
     Eventos, dimensionamento e inicialização
     --------------------------------------------------------------------- */
  const resize = () => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    fitToAspect();
  };

  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(host);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    ).observe(wrap);
  }

  document.addEventListener("rocha:etapa-3d", (event) => {
    setStage(event.detail && event.detail.order);
  });

  document.addEventListener("rocha:explodir-3d", (event) => {
    explodeTarget = event.detail && event.detail.exploded ? 1 : 0;
  });

  const activeCard = document.querySelector(
    ".stage-step-card.is-active[data-stage-order]",
  );
  const storedStage = Number(document.documentElement.dataset.obraStage);
  setStage(
    Number.isFinite(storedStage) && storedStage > 0
      ? storedStage
      : Number(activeCard && activeCard.dataset.stageOrder) || 1,
  );

  updateCamera();
  animate();

  /* Gancho de inspeção (útil para testes e depuração, sem efeito visual) */
  window.__rochaMaquete = {
    scene,
    camera,
    renderer,
    view,
    goal,
    focus,
    setStage,
    getStage: () => currentStage,
    getExplode: () => explodeCurrent,
    setAutoRotate: (value) => {
      autoRotate = Boolean(value);
    },
  };

  /* Painel ainda pode montar depois do primeiro quadro (HTMX) */
  document.body.addEventListener("htmx:afterSwap", () => {
    resize();
  });
};

boot();
