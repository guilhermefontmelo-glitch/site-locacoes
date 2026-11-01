/**
 * Rocha Construtora — Orquestrador de Scroll-Pinning (`01..06`), Painel em Memória & Palco 3D (`scene3d-obra.js`).
 *
 * Conformidade Estrita:
 * - Zero mutação `element.style.*` e zero `commitStyles()` (`style-src-attr 'none'`);
 * - Pista `.obra-scroll-runway` + `.obra-pinned-viewport` com platô final `p in (0.88, 1.00]`;
 * - Atualização instantânea do painel técnico via `json_script` (`#etapas-obra-json`) sem round-trip HTTP;
 * - Carregamento preguiçoso (`import()`) de `scene3d-three.js` a `350px` da seção `#etapas-obra`;
 * - Ciclo de vida simétrico `mountObraStageUI()` / `disposeObraStageUI()`.
 */

import {
  animateOnce,
  cancelRegistry,
  createProgressScrubber,
  createTransformController,
} from "./waapi-driver.js";

const STAGE_PLATEAU_START = 0.88;
const STAGE_COUNT = 6;
const EASE_EDITORIAL = "cubic-bezier(0.22, 1, 0.36, 1)";

/** @type {Set<Animation>} */
const stageAnimations = new Set();
/** @type {AbortController | null} */
let uiAbortController = null;
/** @type {IntersectionObserver | null} */
let lazyWebglObserver = null;
/** @type {number | null} */
let scrollRafId = null;
/** @type {number | null} */
let isoTiltRafId = null;
/** @type {number | null} */
let idleLoadTimer = null;
/** @type {{ mountObraScene?: () => void, disposeObraScene?: () => void } | null} */
let threeModuleRef = null;
/** @type {boolean} */
let webglBootRequested = false;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Carrega o mapa das 6 etapas serializadas no template via `json_script`.
 * @returns {Map<number, Record<string, any>>}
 */
function parseEtapasPayload() {
  const map = new Map();
  const scriptEl = document.getElementById("etapas-obra-json");
  if (!scriptEl || !scriptEl.textContent) return map;
  try {
    const raw = JSON.parse(scriptEl.textContent);
    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        const order = Number(entry?.ordem);
        if (Number.isFinite(order) && order >= 1 && order <= STAGE_COUNT) {
          map.set(order, entry);
        }
      });
    }
  } catch (_err) {
    // Em caso de ausência, o fallback usa os atributos data-* dos botões
  }
  return map;
}

/**
 * Atualiza o card `#painel-etapa-detalhe` diretamente em memória (zero latência/HTTP no scroll).
 * @param {Record<string, any> | undefined} etapaData
 */
function syncStagePanelDOM(etapaData) {
  if (!etapaData) return;
  const host = document.getElementById("painel-etapa-detalhe");
  if (!host) return;

  const card = host.querySelector("[data-etapa-painel]");
  if (card instanceof HTMLElement) {
    card.dataset.etapaPainel = String(etapaData.slug || "");
    card.dataset.etapaOrdem = String(etapaData.ordem || 1);
  }

  const setText = (selector, text) => {
    const el = host.querySelector(selector);
    if (el && typeof text === "string" && el.textContent !== text) {
      el.textContent = text;
    }
  };

  setText("[data-etapa-eyebrow]", `Inspeção de Engenharia · Etapa ${etapaData.codigo}`);
  setText("[data-etapa-progresso]", `${etapaData.progresso_percentual}% da obra`);
  setText("[data-etapa-titulo]", String(etapaData.titulo || ""));
  setText("[data-etapa-subtitulo]", String(etapaData.subtitulo || ""));
  setText("[data-etapa-detalhe]", String(etapaData.detalhe_engenharia || ""));
  setText("[data-etapa-medicao]", String(etapaData.medicao_caixa || ""));

  const waLink = host.querySelector("[data-etapa-whatsapp]");
  if (waLink instanceof HTMLAnchorElement && etapaData.whatsapp_url) {
    waLink.href = String(etapaData.whatsapp_url);
  }

  const mediaWrap = host.querySelector(".etapa-painel-card__media");
  if (mediaWrap) {
    const avifSource = mediaWrap.querySelector('source[type="image/avif"]');
    const webpSource = mediaWrap.querySelector('source[type="image/webp"]');
    const imgEl = mediaWrap.querySelector("img");

    if (avifSource instanceof HTMLSourceElement && etapaData.imagem_avif_url) {
      avifSource.srcset = String(etapaData.imagem_avif_url);
    }
    if (webpSource instanceof HTMLSourceElement && etapaData.imagem_webp_url) {
      webpSource.srcset = String(etapaData.imagem_webp_url);
    }
    if (imgEl instanceof HTMLImageElement) {
      if (etapaData.imagem_webp_url && imgEl.getAttribute("src") !== etapaData.imagem_webp_url) {
        imgEl.src = String(etapaData.imagem_webp_url);
      }
      if (etapaData.titulo) {
        imgEl.alt = String(etapaData.titulo);
      }
    }
  }
}

/**
 * Inicia o carregamento preguiçoso do motor WebGL (`scene3d-three.js`) a `350px` da seção.
 */
function setupLazyWebglLoader() {
  const section = document.getElementById("etapas-obra");
  const host = document.getElementById("iso-webgl");
  if (!section || !host) return;

  const triggerImport = () => {
    if (webglBootRequested) return;
    webglBootRequested = true;
    if (lazyWebglObserver) {
      lazyWebglObserver.disconnect();
      lazyWebglObserver = null;
    }
    if (idleLoadTimer !== null) {
      window.clearTimeout(idleLoadTimer);
      idleLoadTimer = null;
    }

    const moduleUrl =
      document.documentElement.getAttribute("data-js-three") ||
      new URL("./scene3d-three.js", import.meta.url).href;

    const loadNow = () => {
      import(moduleUrl)
        .then((mod) => {
          threeModuleRef = mod;
          if (document.getElementById("iso-webgl") && typeof mod.mountObraScene === "function") {
            mod.mountObraScene();
          }
        })
        .catch((err) => {
          console.warn("[Palco 3D] Fallback CSS 3D mantido:", err);
        });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadNow, { timeout: 600 });
    } else {
      idleLoadTimer = window.setTimeout(loadNow, 48);
    }
  };

  if ("IntersectionObserver" in window) {
    lazyWebglObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          triggerImport();
        }
      },
      { rootMargin: "350px 0px" }
    );
    lazyWebglObserver.observe(section);
  } else {
    triggerImport();
  }
}

/**
 * Aplica explosão omnidirecional `(dx, dy, dz)` no fallback CSS 3D via propriedade `translate` WAAPI.
 * @param {HTMLElement} model
 * @param {boolean} exploded
 */
function animateCssFallbackExplosion(model, exploded) {
  const parts = Array.from(model.querySelectorAll("[data-explode-vec]"));
  const duration = prefersReducedMotion() ? 1 : 520;

  parts.forEach((el) => {
    const raw = (el.getAttribute("data-explode-vec") || "0,0,0").split(",").map(Number);
    const dx = Number.isFinite(raw[0]) ? raw[0] : 0;
    const dy = Number.isFinite(raw[1]) ? raw[1] : 0;
    const dz = Number.isFinite(raw[2]) ? raw[2] : 0;

    const fromTranslate = exploded ? "0px 0px 0px" : `${dx}px ${dy}px ${dz}px`;
    const toTranslate = exploded ? `${dx}px ${dy}px ${dz}px` : "0px 0px 0px";

    animateOnce(
      el,
      [{ translate: fromTranslate }, { translate: toTranslate }],
      { duration, easing: EASE_EDITORIAL, fill: "both" },
      stageAnimations
    );
  });
}

/**
 * Monta o palco arquitetônico 3D, a pista de scroll-pinning (`01..06`) e todos os controles HUD.
 */
export function mountObraStageUI() {
  disposeObraStageUI();

  uiAbortController = new AbortController();
  const { signal } = uiAbortController;

  const runway = document.getElementById("obra-scroll-runway");
  const pinnedViewport = document.getElementById("obra-pinned-viewport");
  const model = document.getElementById("iso-house-model");
  const sceneWrap = document.getElementById("iso-scene-wrap");
  const explodeBtn = document.getElementById("toggle-exploded-3d");
  const renderModeBtn = document.getElementById("toggle-render-mode");
  const statusLabel = document.getElementById("blueprint-stage-label");
  const progressBar = document.getElementById("obra-progress-fill");
  const scanPlane = document.getElementById("iso-scan-plane");
  const stepButtons = Array.from(document.querySelectorAll("[data-stage-order]"));

  if (!(model instanceof HTMLElement) || !stepButtons.length) return;

  const etapasMap = parseEtapasPayload();
  const layers = Array.from(model.querySelectorAll("[data-layer-order]"));
  const holoParts = Array.from(model.querySelectorAll("[data-holo-order]"));

  const progressScrubber = createProgressScrubber(progressBar, "X", stageAnimations);
  const scanController = createTransformController(
    scanPlane,
    "translate3d(0, 0, 8px)",
    stageAnimations
  );
  const isoRotateController = createTransformController(
    model,
    "rotateX(58deg) rotateZ(-42deg)",
    stageAnimations
  );

  let currentOrder = 0;
  let currentSubProgress = 0;
  let explodedState = false;
  let renderMode = "hologram";

  /**
   * Sincroniza camadas, painel técnico, barra WAAPI e evento 3D.
   * @param {number} orderNum
   * @param {number} subProgress
   * @param {boolean} [forcePanelSync=false]
   */
  const applyStageState = (orderNum, subProgress = 0.25, forcePanelSync = false) => {
    const clampedOrder = Math.min(STAGE_COUNT, Math.max(1, Math.round(Number(orderNum) || 1)));
    const clampedSub = Math.min(1, Math.max(0, Number.isFinite(subProgress) ? subProgress : 0));
    const stageChanged = clampedOrder !== currentOrder;

    currentOrder = clampedOrder;
    currentSubProgress = clampedSub;

    if (stageChanged || forcePanelSync) {
      layers.forEach((layer) => {
        const layerNum = Number(layer.getAttribute("data-layer-order"));
        const isVisible = explodedState ? layerNum <= clampedOrder : layerNum <= clampedOrder;
        layer.classList.toggle("is-built", isVisible);
        layer.classList.toggle("is-current", layerNum === clampedOrder);
      });

      holoParts.forEach((part) => {
        const partNum = Number(part.getAttribute("data-holo-order"));
        part.classList.toggle("is-built", partNum <= clampedOrder);
        part.classList.toggle("is-current", partNum === clampedOrder);
      });

      stepButtons.forEach((btn) => {
        const isMatch = Number(btn.getAttribute("data-stage-order")) === clampedOrder;
        btn.classList.toggle("is-active", isMatch);
        btn.setAttribute("aria-current", isMatch ? "step" : "false");
      });

      const etapaInfo = etapasMap.get(clampedOrder);
      const fallbackBtn = stepButtons.find(
        (b) => Number(b.getAttribute("data-stage-order")) === clampedOrder
      );
      const titleText =
        etapaInfo?.titulo || fallbackBtn?.getAttribute("data-stage-title") || "";

      if (statusLabel && titleText) {
        statusLabel.textContent = `Etapa 0${clampedOrder} · ${titleText}`;
      }

      if (etapaInfo) {
        syncStagePanelDOM(etapaInfo);
      }

      document.documentElement.dataset.obraStage = String(clampedOrder);
    }

    const overallRatio = Math.min(
      1,
      Math.max(0.15, (clampedOrder - 1 + clampedSub) / STAGE_COUNT)
    );
    progressScrubber.setProgress(overallRatio);
    scanController.setTransform(
      `translate3d(0, 0, ${(6 + clampedSub * 118).toFixed(1)}px)`
    );

    document.dispatchEvent(
      new CustomEvent("rocha:etapa-3d", {
        detail: { order: clampedOrder, subProgress: clampedSub },
      })
    );
  };

  /**
   * Calcula progresso normalizado `p` da pista `.obra-scroll-runway` quando em modo sticky.
   */
  const evaluateRunwayScroll = () => {
    scrollRafId = null;
    if (!(runway instanceof HTMLElement) || !(pinnedViewport instanceof HTMLElement)) return;

    const computedPos = window.getComputedStyle(pinnedViewport).position;
    if (computedPos !== "sticky") return;

    const runwayRect = runway.getBoundingClientRect();
    const stickyTopPx = Number.parseFloat(window.getComputedStyle(pinnedViewport).top) || 0;
    const scrollableDistance = runway.offsetHeight - pinnedViewport.offsetHeight;
    if (scrollableDistance <= 40) return;

    const rawScrolled = stickyTopPx - runwayRect.top;
    if (rawScrolled < -120 || rawScrolled > scrollableDistance + window.innerHeight) {
      return;
    }

    const p = Math.min(1, Math.max(0, rawScrolled / scrollableDistance));
    if (p <= STAGE_PLATEAU_START) {
      const u = (p / STAGE_PLATEAU_START) * STAGE_COUNT;
      const stageIdx = Math.min(STAGE_COUNT, Math.floor(u) + 1);
      const subProg = u >= STAGE_COUNT ? 1 : u - Math.floor(u);
      applyStageState(stageIdx, subProg);
    } else {
      applyStageState(STAGE_COUNT, 1);
    }
  };

  const requestScrollEval = () => {
    if (scrollRafId === null) {
      scrollRafId = window.requestAnimationFrame(evaluateRunwayScroll);
    }
  };

  window.addEventListener("scroll", requestScrollEval, { passive: true, signal });
  window.addEventListener("resize", requestScrollEval, { passive: true, signal });

  // Clique direto nos marcos 01..06: move para a âncora matemática exata da pista sticky
  stepButtons.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        const targetOrder = Number(btn.getAttribute("data-stage-order")) || 1;
        applyStageState(targetOrder, targetOrder === STAGE_COUNT ? 1 : 0.45, true);

        if (runway instanceof HTMLElement && pinnedViewport instanceof HTMLElement) {
          const computedPos = window.getComputedStyle(pinnedViewport).position;
          const scrollableDistance = runway.offsetHeight - pinnedViewport.offsetHeight;
          if (computedPos === "sticky" && scrollableDistance > 40) {
            const stickyTopPx =
              Number.parseFloat(window.getComputedStyle(pinnedViewport).top) || 0;
            const targetP =
              targetOrder === STAGE_COUNT
                ? 0.91
                : ((targetOrder - 1 + 0.22) / STAGE_COUNT) * STAGE_PLATEAU_START;
            const runwayPageTop = window.scrollY + runway.getBoundingClientRect().top;
            const targetScrollY = runwayPageTop - stickyTopPx + targetP * scrollableDistance;
            window.scrollTo({
              top: Math.max(0, targetScrollY),
              behavior: prefersReducedMotion() ? "auto" : "smooth",
            });
          }
        }
      },
      { signal }
    );
  });

  // Alternância de Modo Holograma CAD vs Modo Realista
  if (renderModeBtn instanceof HTMLButtonElement) {
    renderModeBtn.addEventListener(
      "click",
      () => {
        renderMode = renderMode === "hologram" ? "realistic" : "hologram";
        const isHolo = renderMode === "hologram";
        renderModeBtn.setAttribute("aria-pressed", String(isHolo));
        renderModeBtn.dataset.renderMode = renderMode;
        const labelSpan = renderModeBtn.querySelector("[data-render-mode-text]");
        if (labelSpan) {
          labelSpan.textContent = isHolo ? "Holograma CAD" : "Modo Realista";
        }
        if (sceneWrap) {
          sceneWrap.classList.toggle("is-realistic-mode", !isHolo);
        }
        document.dispatchEvent(
          new CustomEvent("rocha:modo-3d", { detail: { mode: renderMode } })
        );
      },
      { signal }
    );
  }

  // Alternância de Vista Explodida Omnidirecional (dx, dy, dz)
  if (explodeBtn instanceof HTMLButtonElement) {
    explodeBtn.addEventListener(
      "click",
      () => {
        explodedState = model.classList.toggle("is-exploded");
        explodeBtn.setAttribute("aria-pressed", String(explodedState));
        const labelSpan = explodeBtn.querySelector("[data-explode-text]");
        if (labelSpan) {
          labelSpan.textContent = explodedState ? "Compactar Camadas" : "Explodir Camadas 3D";
        }
        animateCssFallbackExplosion(model, explodedState);
        document.dispatchEvent(
          new CustomEvent("rocha:explodir-3d", { detail: { exploded: explodedState } })
        );
      },
      { signal }
    );
  }

  // Rotação por ponteiro do fallback CSS 3D via WAAPI (sem tocar em element.style)
  if (sceneWrap instanceof HTMLElement && !prefersReducedMotion()) {
    sceneWrap.addEventListener(
      "pointermove",
      (event) => {
        if (sceneWrap.classList.contains("has-webgl")) return;
        const rect = sceneWrap.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;

        if (isoTiltRafId !== null) window.cancelAnimationFrame(isoTiltRafId);
        isoTiltRafId = window.requestAnimationFrame(() => {
          isoTiltRafId = null;
          const rx = (58 - ny * 16).toFixed(1);
          const rz = (-42 + nx * 28).toFixed(1);
          isoRotateController.setTransform(`rotateX(${rx}deg) rotateZ(${rz}deg)`);
        });
      },
      { passive: true, signal }
    );

    sceneWrap.addEventListener(
      "pointerleave",
      () => {
        if (isoTiltRafId !== null) {
          window.cancelAnimationFrame(isoTiltRafId);
          isoTiltRafId = null;
        }
        isoRotateController.setTransform("rotateX(58deg) rotateZ(-42deg)");
      },
      { passive: true, signal }
    );
  }

  // Estado inicial (respeita etapa pré-renderizada no SSR, ex.: /etapas/2/)
  const initialActiveBtn =
    stepButtons.find((b) => b.classList.contains("is-active")) || stepButtons[0];
  const initialOrder = Number(initialActiveBtn?.getAttribute("data-stage-order")) || 1;
  applyStageState(initialOrder, initialOrder === STAGE_COUNT ? 1 : 0.25, true);
  evaluateRunwayScroll();

  setupLazyWebglLoader();
}

/**
 * Descarta integralmente observers, listeners, WAAPI e cena WebGL ao sair da Construtora.
 */
export function disposeObraStageUI() {
  if (scrollRafId !== null) {
    window.cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  if (isoTiltRafId !== null) {
    window.cancelAnimationFrame(isoTiltRafId);
    isoTiltRafId = null;
  }
  if (idleLoadTimer !== null) {
    window.clearTimeout(idleLoadTimer);
    idleLoadTimer = null;
  }
  if (lazyWebglObserver) {
    lazyWebglObserver.disconnect();
    lazyWebglObserver = null;
  }
  if (uiAbortController) {
    uiAbortController.abort();
    uiAbortController = null;
  }
  if (threeModuleRef && typeof threeModuleRef.disposeObraScene === "function") {
    threeModuleRef.disposeObraScene();
  }
  webglBootRequested = false;
  cancelRegistry(stageAnimations);
}

export const initScene3dObra = mountObraStageUI;
window.initScene3dObra = mountObraStageUI;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountObraStageUI, { once: true });
} else {
  mountObraStageUI();
}
