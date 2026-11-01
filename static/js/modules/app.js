/**
 * Bootstrap Modular ES6+ — Rocha Construtora & Rocha Locações (`app.js`).
 *
 * Responsabilidades:
 * - Alternância instantânea Dark/Light e sincronia de logos sem FOUC;
 * - Transição SPA entre Construtora (`/`) e Locações (`/locadora/`) com cache TTL (`30 min`),
 *   carregamento sob demanda de CSS/JS da vertical alvo e descarte simétrico de memória/WebGL;
 * - Integração com `waapi-driver.js` e `scroll-choreography.js` com zero mutação `element.style.*`
 *   (100% compatível com `Content-Security-Policy: style-src-attr 'none'`).
 */

import {
  disposeScrollChoreography,
  hydrateChoreographySubtree,
  mountScrollChoreography,
} from "./scroll-choreography.js";
import { createProgressScrubber } from "./waapi-driver.js";

const PAGE_CACHE_TTL_MS = 30 * 60 * 1000;

/** @type {Map<string, { htmlText: string, cachedAt: number }>} */
const pageCache = new Map();

const LOGO_ANIM_CLASSES = [
  "is-logo-out-right",
  "is-logo-out-left",
  "is-logo-out-theme",
  "is-logo-in-right",
  "is-logo-in-left",
  "is-logo-in-theme",
];

const preloadBrandLogos = () => {
  const firstLogo = document.querySelector("img[data-theme-logo]");
  if (!firstLogo) return;
  [
    firstLogo.getAttribute("data-construtora-dark"),
    firstLogo.getAttribute("data-construtora-light"),
    firstLogo.getAttribute("data-locadora-dark"),
    firstLogo.getAttribute("data-locadora-light"),
  ]
    .filter(Boolean)
    .forEach((src) => {
      const img = new Image();
      img.src = src;
    });
};

const syncThemeAndUnitLogos = (unitOverride, themeOverride, options = {}) => {
  const { animate = false, mode = "unit" } = options;
  const unit =
    unitOverride || document.documentElement.getAttribute("data-unit") || "construtora";
  const theme =
    themeOverride || document.documentElement.getAttribute("data-theme") || "dark";

  const attrName = `data-${unit === "locadora" ? "locadora" : "construtora"}-${
    theme === "light" ? "light" : "dark"
  }`;
  const brandName = unit === "locadora" ? "Rocha Locações" : "Rocha Construtora";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll("img[data-theme-logo]").forEach((img) => {
    const targetSrc = img.getAttribute(attrName);
    if (!targetSrc) return;

    if (!animate || reducedMotion || img.getAttribute("src") === targetSrc) {
      img.setAttribute("src", targetSrc);
      img.setAttribute("alt", `Logo ${brandName}`);
      return;
    }

    if (img.__logoTimerOut) window.clearTimeout(img.__logoTimerOut);
    if (img.__logoTimerIn) window.clearTimeout(img.__logoTimerIn);
    img.classList.remove(...LOGO_ANIM_CLASSES);

    const outClass =
      mode === "theme"
        ? "is-logo-out-theme"
        : unit === "locadora"
          ? "is-logo-out-right"
          : "is-logo-out-left";
    const inClass =
      mode === "theme"
        ? "is-logo-in-theme"
        : unit === "locadora"
          ? "is-logo-in-right"
          : "is-logo-in-left";

    img.classList.add(outClass);

    img.__logoTimerOut = window.setTimeout(() => {
      img.setAttribute("src", targetSrc);
      img.setAttribute("alt", `Logo ${brandName}`);
      img.classList.remove(outClass);
      img.classList.add(inClass);

      img.__logoTimerIn = window.setTimeout(() => {
        img.classList.remove(inClass);
      }, 290);
    }, 135);
  });

  const headerBrandLink = document.getElementById("header-brand-link");
  if (headerBrandLink) {
    headerBrandLink.setAttribute("href", unit === "locadora" ? "/locadora/" : "/");
    headerBrandLink.setAttribute("aria-label", `${brandName} — Voltar ao início`);
  }

  const drawerBrand = document.getElementById("mobile-drawer-brand");
  if (drawerBrand) {
    drawerBrand.textContent = brandName;
  }
};

const syncAllUnitSwitchersUI = (targetUnit) => {
  const desktopSwitcher = document.getElementById("unit-switcher");
  if (desktopSwitcher) {
    desktopSwitcher.setAttribute("data-active-unit", targetUnit);
    desktopSwitcher.querySelectorAll(".unit-switcher__item").forEach((item) => {
      const isTarget = item.getAttribute("data-unit-target") === targetUnit;
      item.classList.toggle("is-active", isTarget);
      if (isTarget) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  const mobileUnitBar = document.getElementById("mobile-unit-bar");
  if (mobileUnitBar) {
    mobileUnitBar.setAttribute("data-active-unit", targetUnit);
    mobileUnitBar.querySelectorAll(".mobile-unit-bar__item").forEach((item) => {
      const isTarget = item.getAttribute("data-unit-target") === targetUnit;
      item.classList.toggle("is-active", isTarget);
      if (isTarget) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  document.querySelectorAll(".mobile-drawer__units a[data-unit-target]").forEach((btn) => {
    const isTarget = btn.getAttribute("data-unit-target") === targetUnit;
    btn.classList.toggle("btn--gold", isTarget);
    btn.classList.toggle("btn--outline", !isTarget);
  });
};

const initThemeSwitcher = () => {
  const toggleBtn = document.getElementById("theme-toggle");

  const syncThemeState = (animateLogo = false) => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    syncThemeAndUnitLogos(undefined, current, { animate: animateLogo, mode: "theme" });
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", String(current === "light"));
    }
  };

  syncThemeState(false);

  if (!toggleBtn || toggleBtn.dataset.themeBound === "true") return;
  toggleBtn.dataset.themeBound = "true";

  toggleBtn.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reducedMotion) {
      if (root.__themeTransitionTimer) {
        window.clearTimeout(root.__themeTransitionTimer);
      }
      root.classList.add("is-theme-transitioning");
      root.__themeTransitionTimer = window.setTimeout(() => {
        root.classList.remove("is-theme-transitioning");
      }, 430);
    }

    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("rocha-theme", next);
    } catch {
      // Ignora indisponibilidade de storage em navegação privada restrita
    }
    syncThemeState(true);
  });
};

const initScrollProgressFallback = () => {
  if (window.__rochaScrollBound) return;
  if (typeof CSS !== "undefined" && CSS.supports("animation-timeline", "scroll()")) {
    return;
  }

  const barEl = document.getElementById("scroll-progress");
  if (!barEl) return;

  window.__rochaScrollBound = true;
  const scrubber = createProgressScrubber(barEl, "X");
  let ticking = false;

  const updateBar = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    scrubber.setProgress(ratio);
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateBar);
      }
    },
    { passive: true },
  );
  updateBar();
};

const initFilterPillsState = () => {
  const pillsWrap = document.querySelector(".filter-pills");
  if (!pillsWrap || pillsWrap.dataset.pillsBound === "true") return;
  pillsWrap.dataset.pillsBound = "true";

  pillsWrap.addEventListener("click", (event) => {
    const pill = event.target.closest(".filter-pill");
    if (!pill) return;
    pillsWrap.querySelectorAll(".filter-pill").forEach((el) => {
      el.classList.toggle("is-active", el === pill);
    });
  });
};

/**
 * Garante que a folha de estilo exclusiva da vertical alvo esteja carregada antes do swap.
 * @param {"construtora" | "locadora"} targetUnit
 * @returns {Promise<void>}
 */
const ensureVerticalStylesheet = (targetUnit) => {
  const attrName =
    targetUnit === "locadora" ? "data-css-locadora" : "data-css-construtora";
  const cssHref = document.documentElement.getAttribute(attrName);
  if (!cssHref) return Promise.resolve();

  const existing =
    document.querySelector(`link[data-vertical-css="${targetUnit}"]`) ||
    document.querySelector(`link[rel="stylesheet"][href="${cssHref}"]`);
  if (existing) return Promise.resolve();

  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    link.setAttribute("data-vertical-css", targetUnit);

    const timer = window.setTimeout(resolve, 1500);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    document.head.appendChild(link);
  });
};

/**
 * Desmonta de forma limpa os módulos interativos exclusivos da Rocha Construtora.
 * @returns {Promise<void>}
 */
const disposeConstrutoraModules = async () => {
  const obraUrl =
    document.documentElement.getAttribute("data-js-obra") ||
    new URL("./scene3d-obra.js", import.meta.url).href;
  const simUrl =
    document.documentElement.getAttribute("data-js-simulador") ||
    new URL("./simulator-ui.js", import.meta.url).href;

  await Promise.allSettled([
    import(obraUrl).then((m) => m.disposeObraStageUI?.()),
    import(simUrl).then((m) => m.disposeSimulatorUI?.()),
  ]);
};

/**
 * Importa e monta os módulos interativos exclusivos da Rocha Construtora sob demanda.
 * @param {ParentNode} root
 * @returns {Promise<void>}
 */
const mountConstrutoraModules = async (root) => {
  const obraUrl =
    document.documentElement.getAttribute("data-js-obra") ||
    new URL("./scene3d-obra.js", import.meta.url).href;
  const simUrl =
    document.documentElement.getAttribute("data-js-simulador") ||
    new URL("./simulator-ui.js", import.meta.url).href;

  await Promise.allSettled([
    import(obraUrl).then((m) => m.mountObraStageUI?.()),
    import(simUrl).then((m) => m.mountSimulatorUI?.(root)),
  ]);
};

const fetchUnitDocument = async (href) => {
  const normalizedUrl = new URL(href, window.location.origin).pathname;
  const cached = pageCache.get(normalizedUrl);
  if (cached && Date.now() - cached.cachedAt < PAGE_CACHE_TTL_MS) {
    return cached.htmlText;
  }

  const response = await fetch(normalizedUrl, {
    headers: { "X-Requested-With": "RochaUnitTransition" },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const htmlText = await response.text();
  pageCache.set(normalizedUrl, { htmlText, cachedAt: Date.now() });
  return htmlText;
};

const schedulePrefetchOtherUnit = () => {
  const runPrefetch = () => {
    const currentUnit =
      document.documentElement.getAttribute("data-unit") || "construtora";
    const otherHref = currentUnit === "locadora" ? "/" : "/locadora/";
    fetchUnitDocument(otherHref).catch(() => {
      // Prefetch silencioso
    });
  };

  const scheduleIdle = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(runPrefetch, { timeout: 2200 });
    } else {
      window.setTimeout(runPrefetch, 900);
    }
  };

  if (document.readyState === "complete") {
    scheduleIdle();
  } else {
    window.addEventListener("load", scheduleIdle, { once: true });
  }
};

const initUnitSwitcherTransition = () => {
  if (window.__rochaUnitSwitcherBound) return;
  window.__rochaUnitSwitcherBound = true;

  let isTransitioning = false;

  const performUnitSwitch = async (targetUnit, href, pushHistory = true) => {
    const currentUnit =
      document.documentElement.getAttribute("data-unit") || "construtora";
    if (isTransitioning || !targetUnit || targetUnit === currentUnit) return;
    isTransitioning = true;

    const normalizedTarget = targetUnit === "locadora" ? "locadora" : "construtora";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mainContent = document.getElementById("conteudo-principal");

    document.documentElement.setAttribute("data-unit", normalizedTarget);
    syncThemeAndUnitLogos(normalizedTarget, undefined, { animate: true, mode: "unit" });
    syncAllUnitSwitchersUI(normalizedTarget);

    try {
      const fetchPromise = Promise.all([
        fetchUnitDocument(href),
        ensureVerticalStylesheet(normalizedTarget),
      ]);
      const currentNav = document.getElementById("primary-nav");
      const navOutClass =
        normalizedTarget === "locadora" ? "is-nav-out-left" : "is-nav-out-right";
      const navInClass =
        normalizedTarget === "locadora" ? "is-nav-in-right" : "is-nav-in-left";

      if (currentNav && !reducedMotion) {
        currentNav.classList.remove(
          "is-nav-out-left",
          "is-nav-out-right",
          "is-nav-in-right",
          "is-nav-in-left",
        );
        currentNav.classList.add(navOutClass);
      }

      if (mainContent && !reducedMotion) {
        const exitClass =
          normalizedTarget === "locadora"
            ? "is-exiting-to-locadora"
            : "is-exiting-to-construtora";
        mainContent.classList.add(exitClass);
        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }

      const [htmlText] = await fetchPromise;
      const parser = new DOMParser();
      const nextDoc = parser.parseFromString(htmlText, "text/html");

      const nextMain = nextDoc.getElementById("conteudo-principal");
      const nextNav = nextDoc.getElementById("primary-nav");
      const nextDrawerLinks = nextDoc.getElementById("mobile-drawer-links");
      const nextFooter = nextDoc.getElementById("rodape");

      if (!nextMain) {
        window.location.assign(href);
        return;
      }

      // Descarte simétrico ANTES da remoção da subárvore DOM ativa
      disposeScrollChoreography();
      if (currentUnit === "construtora") {
        await disposeConstrutoraModules();
      }

      document.title = nextDoc.title || document.title;

      if (nextNav && currentNav) {
        currentNav.innerHTML = nextNav.innerHTML;
        currentNav.classList.remove(navOutClass);
        if (!reducedMotion) {
          currentNav.classList.add(navInClass);
          window.setTimeout(() => {
            currentNav.classList.remove(navInClass);
          }, 380);
        }
      }

      if (nextDrawerLinks) {
        const currentDrawerLinks = document.getElementById("mobile-drawer-links");
        if (currentDrawerLinks) currentDrawerLinks.innerHTML = nextDrawerLinks.innerHTML;
      }

      if (mainContent) {
        mainContent.innerHTML = nextMain.innerHTML;
        mainContent.classList.remove("is-exiting-to-locadora", "is-exiting-to-construtora");

        if (!reducedMotion) {
          const enterClass =
            normalizedTarget === "locadora"
              ? "is-entering-from-right"
              : "is-entering-from-left";
          mainContent.classList.add(enterClass);
          window.setTimeout(() => {
            mainContent.classList.remove(enterClass);
          }, 380);
        }
      }

      if (nextFooter) {
        const currentFooter = document.getElementById("rodape");
        if (currentFooter) {
          currentFooter.innerHTML = nextFooter.innerHTML;
        }
      }

      const footerLogo = document.getElementById("footer-brand-logo");
      if (footerLogo) {
        const theme = document.documentElement.getAttribute("data-theme") || "dark";
        const attrName = `data-${normalizedTarget === "locadora" ? "locadora" : "construtora"}-${
          theme === "light" ? "light" : "dark"
        }`;
        const targetSrc = footerLogo.getAttribute(attrName);
        if (targetSrc) footerLogo.setAttribute("src", targetSrc);
      }

      if (pushHistory) {
        window.history.pushState({ unit: normalizedTarget, href }, "", href);
      }

      window.scrollTo({ top: 0, behavior: "instant" });

      if (window.htmx) {
        window.htmx.process(document.body);
      }

      mountScrollChoreography(mainContent || document);
      initFilterPillsState();

      if (normalizedTarget === "construtora") {
        await mountConstrutoraModules(mainContent || document);
      }
    } catch {
      window.location.assign(href);
    } finally {
      isTransitioning = false;
    }
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-unit-target]");
    if (!link) return;

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const targetUnit = link.getAttribute("data-unit-target");
    const currentUnit =
      document.documentElement.getAttribute("data-unit") || "construtora";
    const href = link.getAttribute("href");

    if (!href || !targetUnit || targetUnit === currentUnit) {
      return;
    }

    event.preventDefault();
    performUnitSwitch(targetUnit, href, true);
  });

  window.addEventListener("popstate", () => {
    const path = window.location.pathname;
    const targetUnit = path.startsWith("/locadora") ? "locadora" : "construtora";
    performUnitSwitch(targetUnit, path, false);
  });
};

const initMobileDrawer = () => {
  const openBtn = document.getElementById("menu-toggle");
  const drawer = document.getElementById("mobile-drawer");
  if (!openBtn || !drawer || openBtn.dataset.drawerBound === "true") return;
  openBtn.dataset.drawerBound = "true";

  const setOpen = (open) => {
    drawer.hidden = !open;
    openBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("is-scroll-locked", open);
  };

  openBtn.addEventListener("click", () => {
    setOpen(drawer.hidden);
  });

  drawer.addEventListener("click", (event) => {
    if (event.target.closest("[data-drawer-close], [data-drawer-link], [data-unit-target]")) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hidden) {
      setOpen(false);
      openBtn.focus();
    }
  });
};

const initDialogAndHtmxHooks = () => {
  const dialog = document.getElementById("modal-dinamico");
  if (dialog && dialog.dataset.dialogBound !== "true") {
    dialog.dataset.dialogBound = "true";

    dialog.querySelectorAll("[data-dialog-close]").forEach((btn) => {
      btn.addEventListener("click", () => dialog.close());
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  }

  if (!window.__rochaHtmxSwapBound) {
    window.__rochaHtmxSwapBound = true;
    document.body.addEventListener("htmx:afterSwap", (event) => {
      const target = event.detail?.target;
      if (dialog && target?.id === "modal-conteudo" && !dialog.open) {
        dialog.showModal();
      }
      if (target instanceof HTMLElement) {
        hydrateChoreographySubtree(target);
      }
    });
  }
};

const bootstrapRochaApp = () => {
  preloadBrandLogos();
  initThemeSwitcher();
  initUnitSwitcherTransition();
  initMobileDrawer();
  initDialogAndHtmxHooks();
  initScrollProgressFallback();
  mountScrollChoreography(document.getElementById("conteudo-principal") || document);
  initFilterPillsState();
  schedulePrefetchOtherUnit();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapRochaApp, { once: true });
} else {
  bootstrapRochaApp();
}
