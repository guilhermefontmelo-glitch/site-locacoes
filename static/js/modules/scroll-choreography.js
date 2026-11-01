/**
 * Rocha Construtora & Rocha Locações — Coreografia de Rolagem WAAPI (`scroll-choreography.js`).
 *
 * Recursos:
 * 1. Tipografia cinética acessível (`[data-kinetic="words" | "chars"]`) com máscara `.kinetic-mask`,
 *    preservando `aria-label` íntegro no elemento original e `aria-hidden="true"` nos spans visuais;
 * 2. Cascata Stagger (`[data-stagger-group]` -> `[data-stagger-item]`) reidratável em swaps HTMX;
 * 3. Conectores progressivos de linha do tempo (`[data-timeline-section]` -> `[data-timeline-fill]`);
 * 4. Contagem suave de métricas numéricas (`[data-count-to]`);
 * 5. Zero mutação `element.style.*` (`style-src-attr 'none'`) e bypass total sob `prefers-reduced-motion`.
 */

import { animateOnce, cancelRegistry, createProgressScrubber } from "./waapi-driver.js";

const EASE_EDITORIAL = "cubic-bezier(0.22, 1, 0.36, 1)";

/** @type {Set<Animation>} */
const choreographyAnimations = new Set();
/** @type {Set<IntersectionObserver>} */
const activeObservers = new Set();
/** @type {AbortController | null} */
let scrollAbortController = null;
/** @type {Array<{ section: HTMLElement, scrubber: ReturnType<typeof createProgressScrubber> }>} */
let timelineScrubbers = [];
/** @type {number | null} */
let timelineRafId = null;

function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Segmenta recursivamente apenas nós de texto (preservando ícones SVG e spans `.editorial-accent`)
 * em unidades `.kinetic-mask > .kinetic-unit[aria-hidden="true"]`.
 * @param {HTMLElement} host
 * @param {"words" | "chars"} mode
 * @returns {HTMLElement[]}
 */
function splitElementKinetic(host, mode) {
  if (host.dataset.kineticSplitDone === "true") {
    return Array.from(host.querySelectorAll(".kinetic-unit"));
  }

  const plainText = (host.textContent || "").replace(/\s+/g, " ").trim();
  if (!plainText) return [];

  host.setAttribute("aria-label", plainText);
  host.dataset.kineticSplitDone = "true";

  /** @type {HTMLElement[]} */
  const units = [];

  /** @param {Node} node */
  const transformNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.nodeValue || "";
      if (!raw.trim()) {
        return document.createTextNode(raw);
      }

      const frag = document.createDocumentFragment();
      const tokens = raw.split(/(\s+)/);
      tokens.forEach((token) => {
        if (!token) return;
        if (/^\s+$/.test(token)) {
          frag.appendChild(document.createTextNode(" "));
          return;
        }

        if (mode === "chars" && token.length <= 28) {
          const wordWrap = document.createElement("span");
          wordWrap.className = "kinetic-word-nowrap";
          wordWrap.setAttribute("aria-hidden", "true");
          Array.from(token).forEach((ch) => {
            const mask = document.createElement("span");
            mask.className = "kinetic-mask";
            mask.setAttribute("aria-hidden", "true");
            const unit = document.createElement("span");
            unit.className = "kinetic-unit";
            unit.setAttribute("aria-hidden", "true");
            unit.textContent = ch;
            mask.appendChild(unit);
            wordWrap.appendChild(mask);
            units.push(unit);
          });
          frag.appendChild(wordWrap);
        } else {
          const mask = document.createElement("span");
          mask.className = "kinetic-mask";
          mask.setAttribute("aria-hidden", "true");
          const unit = document.createElement("span");
          unit.className = "kinetic-unit";
          unit.setAttribute("aria-hidden", "true");
          unit.textContent = token;
          mask.appendChild(unit);
          frag.appendChild(mask);
          units.push(unit);
        }
      });
      return frag;
    }

    if (node instanceof HTMLElement) {
      if (node.tagName.toLowerCase() === "svg" || node.classList.contains("heroicon")) {
        node.setAttribute("aria-hidden", "true");
        return node.cloneNode(true);
      }
      const clone = /** @type {HTMLElement} */ (node.cloneNode(false));
      clone.setAttribute("aria-hidden", "true");
      Array.from(node.childNodes).forEach((child) => {
        clone.appendChild(transformNode(child));
      });
      return clone;
    }

    return node.cloneNode(true);
  };

  const nextChildren = Array.from(host.childNodes).map(transformNode);
  host.replaceChildren(...nextChildren);
  return units;
}

/**
 * Anima títulos e eyebrows marcados com `[data-kinetic]`.
 * @param {ParentNode} root
 */
function setupKineticTypography(root) {
  const targets = Array.from(root.querySelectorAll("[data-kinetic]"));
  if (!targets.length) return;

  if (isReducedMotion() || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-kinetic-ready"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const host = /** @type {HTMLElement} */ (entry.target);
        obs.unobserve(host);
        if (host.dataset.kineticAnimated === "true") return;
        host.dataset.kineticAnimated = "true";

        const mode = host.getAttribute("data-kinetic") === "chars" ? "chars" : "words";
        const units = splitElementKinetic(host, mode);
        host.classList.add("is-kinetic-ready");

        const stepDelay = mode === "chars" ? 16 : 38;
        units.forEach((unit, idx) => {
          animateOnce(
            unit,
            [
              { opacity: 0, transform: "translate3d(0, 105%, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: mode === "chars" ? 440 : 580,
              delay: Math.min(idx * stepDelay, 520),
              easing: EASE_EDITORIAL,
              fill: "both",
            },
            choreographyAnimations
          );
        });
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -32px 0px" }
  );

  activeObservers.add(observer);
  targets.forEach((el) => {
    if (el instanceof HTMLElement && el.dataset.kineticAnimated !== "true") {
      observer.observe(el);
    }
  });
}

/**
 * Configura revelação escalonada `[data-stagger-group]` -> `[data-stagger-item]`.
 * @param {ParentNode} root
 */
function setupStaggerGroups(root) {
  const groups = Array.from(root.querySelectorAll("[data-stagger-group]"));
  if (root instanceof HTMLElement && root.hasAttribute("data-stagger-group")) {
    groups.unshift(root);
  }
  if (!groups.length) return;

  if (isReducedMotion() || !("IntersectionObserver" in window)) {
    groups.forEach((group) => {
      group.querySelectorAll("[data-stagger-item]").forEach((item) => {
        item.classList.add("is-visible");
      });
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const group = /** @type {HTMLElement} */ (entry.target);
        obs.unobserve(group);

        const items = Array.from(
          group.querySelectorAll("[data-stagger-item]:not([data-stagger-done='true'])")
        );
        items.forEach((item, idx) => {
          if (!(item instanceof HTMLElement)) return;
          item.dataset.staggerDone = "true";
          item.classList.add("is-visible");
          animateOnce(
            item,
            [
              { opacity: 0, transform: "translate3d(0, 1.35rem, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 540,
              delay: Math.min(idx * 65, 460),
              easing: EASE_EDITORIAL,
              fill: "both",
            },
            choreographyAnimations
          );
        });
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -28px 0px" }
  );

  activeObservers.add(observer);
  groups.forEach((group) => observer.observe(group));
}

/**
 * Configura blocos `[data-reveal]` gerais com WAAPI.
 * @param {ParentNode} root
 */
function setupRevealBlocks(root) {
  const blocks = Array.from(root.querySelectorAll("[data-reveal]:not(.is-visible)"));
  if (!blocks.length) return;

  if (isReducedMotion() || !("IntersectionObserver" in window)) {
    blocks.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = /** @type {HTMLElement} */ (entry.target);
        obs.unobserve(el);
        el.classList.add("is-visible");
        animateOnce(
          el,
          [
            { opacity: 0, transform: "translate3d(0, 1.25rem, 0)" },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: 560,
            easing: EASE_EDITORIAL,
            fill: "both",
          },
          choreographyAnimations
        );
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -36px 0px" }
  );

  activeObservers.add(observer);
  blocks.forEach((el) => observer.observe(el));
}

/**
 * Anima discretamente métricas numéricas `[data-count-to]`.
 * @param {ParentNode} root
 */
function setupHeroCounters(root) {
  const counters = Array.from(
    root.querySelectorAll("[data-count-to]:not([data-count-done='true'])")
  );
  if (!counters.length) return;

  const finalizeCounter = (el) => {
    const target = Number.parseInt(el.getAttribute("data-count-to") || "0", 10);
    const suffix = el.getAttribute("data-count-suffix") || "";
    el.textContent = `${target}${suffix}`;
    el.dataset.countDone = "true";
  };

  if (isReducedMotion() || !("IntersectionObserver" in window)) {
    counters.forEach((el) => {
      if (el instanceof HTMLElement) finalizeCounter(el);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = /** @type {HTMLElement} */ (entry.target);
        obs.unobserve(el);
        if (el.dataset.countDone === "true") return;
        el.dataset.countDone = "true";

        const target = Number.parseInt(el.getAttribute("data-count-to") || "0", 10);
        const suffix = el.getAttribute("data-count-suffix") || "";
        const duration = 880;
        const start = performance.now();

        const step = (now) => {
          if (!el.isConnected) return;
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const current = Math.round(target * eased);
          el.textContent = `${current}${suffix}`;
          if (t < 1) {
            window.requestAnimationFrame(step);
          }
        };
        window.requestAnimationFrame(step);
      });
    },
    { threshold: 0.4 }
  );

  activeObservers.add(observer);
  counters.forEach((el) => observer.observe(el));
}

/**
 * Vincula preenchimento progressivo de linhas do tempo (`#financiamento-caixa`, `#como-alugar`)
 * ao scroll via WAAPI scrubber quando `animation-timeline: view()` não está ativo.
 * @param {ParentNode} root
 */
function setupTimelineConnectors(root) {
  const sections = Array.from(root.querySelectorAll("[data-timeline-section]"));
  if (!sections.length) return;

  if (isReducedMotion()) {
    sections.forEach((sec) => {
      const fill = sec.querySelector("[data-timeline-fill]");
      if (fill instanceof HTMLElement) {
        const scrubber = createProgressScrubber(fill, "X", choreographyAnimations);
        scrubber.setProgress(1);
      }
    });
    return;
  }

  if (typeof CSS !== "undefined" && CSS.supports("animation-timeline", "view()")) {
    return;
  }

  sections.forEach((sec) => {
    if (!(sec instanceof HTMLElement)) return;
    const fill = sec.querySelector("[data-timeline-fill]");
    if (!(fill instanceof HTMLElement)) return;
    if (timelineScrubbers.some((entry) => entry.section === sec)) return;
    const scrubber = createProgressScrubber(fill, "X", choreographyAnimations);
    timelineScrubbers.push({ section: sec, scrubber });
  });

  if (!timelineScrubbers.length) return;

  const updateTimelines = () => {
    timelineRafId = null;
    const vh = window.innerHeight || 1;
    timelineScrubbers.forEach(({ section, scrubber }) => {
      if (!section.isConnected) return;
      const rect = section.getBoundingClientRect();
      const start = vh * 0.82;
      const end = vh * 0.22;
      const span = Math.max(1, rect.height + (start - end));
      const progress = (start - rect.top) / span;
      scrubber.setProgress(progress);
    });
  };

  if (!scrollAbortController) {
    scrollAbortController = new AbortController();
    const requestTick = () => {
      if (timelineRafId === null) {
        timelineRafId = window.requestAnimationFrame(updateTimelines);
      }
    };
    window.addEventListener("scroll", requestTick, {
      passive: true,
      signal: scrollAbortController.signal,
    });
    window.addEventListener("resize", requestTick, {
      passive: true,
      signal: scrollAbortController.signal,
    });
  }
  updateTimelines();
}

/**
 * Reidrata apenas um fragmento recém-injetado pelo HTMX (ex.: grid de equipamentos filtrado).
 * @param {ParentNode} subtree
 */
export function hydrateChoreographySubtree(subtree) {
  if (!subtree) return;
  setupStaggerGroups(subtree);
  setupRevealBlocks(subtree);
  setupHeroCounters(subtree);
}

/**
 * Monta toda a coreografia de rolagem na árvore informada.
 * @param {ParentNode} [root=document]
 */
export function mountScrollChoreography(root = document) {
  setupKineticTypography(root);
  setupStaggerGroups(root);
  setupRevealBlocks(root);
  setupHeroCounters(root);
  setupTimelineConnectors(root);
}

/**
 * Descarta 100% dos observers, listeners e animações WAAPI da coreografia ativa.
 */
export function disposeScrollChoreography() {
  if (timelineRafId !== null) {
    window.cancelAnimationFrame(timelineRafId);
    timelineRafId = null;
  }
  if (scrollAbortController) {
    scrollAbortController.abort();
    scrollAbortController = null;
  }
  activeObservers.forEach((obs) => obs.disconnect());
  activeObservers.clear();
  timelineScrubbers.forEach(({ scrubber }) => scrubber.cancel());
  timelineScrubbers = [];
  cancelRegistry(choreographyAnimations);
}
