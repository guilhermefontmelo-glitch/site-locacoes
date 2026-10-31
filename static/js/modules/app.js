/**
 * Bootstrap Modular ES6+ — Rocha Construtora & Rocha Locações
 * Zero-Bloat: apenas interações essenciais de UI, acessibilidade (<dialog>/drawer),
 * alternância instantânea de logo/tema Dark/Light, transição fluida em tempo real
 * entre Construtora e Locações (sem recarregar o cabeçalho e sem atraso na logo).
 */

const pageCache = new Map();

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

const LOGO_ANIM_CLASSES = [
  "is-logo-out-right",
  "is-logo-out-left",
  "is-logo-out-theme",
  "is-logo-in-right",
  "is-logo-in-left",
  "is-logo-in-theme",
];

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

    // Fase 1 (0ms -> 135ms): Saída suave e equilibrada da logo atual imediatamente no clique
    img.classList.add(outClass);

    // Fase 2 (135ms -> 415ms): Troca a imagem pré-carregada e entra com deslize discreto
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

const initScrollRevealAndFallbackProgress = () => {
  if (!window.__rochaScrollBound && !CSS.supports("animation-timeline", "scroll()")) {
    window.__rochaScrollBound = true;
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
            document.documentElement.style.setProperty("--scroll-ratio", ratio.toFixed(4));
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true },
    );
  }

  const revealTargets = document.querySelectorAll("[data-reveal]:not(.is-visible)");
  if (!revealTargets.length) return;

  if (!("IntersectionObserver" in window)) {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -40px 0px" },
  );

  revealTargets.forEach((el) => observer.observe(el));
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

const fetchUnitDocument = async (href) => {
  const normalizedUrl = new URL(href, window.location.origin).pathname;
  if (pageCache.has(normalizedUrl)) {
    return pageCache.get(normalizedUrl);
  }
  const response = await fetch(normalizedUrl, {
    headers: { "X-Requested-With": "RochaUnitTransition" },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const htmlText = await response.text();
  pageCache.set(normalizedUrl, htmlText);
  return htmlText;
};

const prefetchOtherUnit = () => {
  const currentUnit = document.documentElement.getAttribute("data-unit") || "construtora";
  const otherHref = currentUnit === "locadora" ? "/" : "/locadora/";
  fetchUnitDocument(otherHref).catch(() => {
    // Prefetch silencioso
  });
};

const initUnitSwitcherTransition = () => {
  if (window.__rochaUnitSwitcherBound) return;
  window.__rochaUnitSwitcherBound = true;

  const switcher = document.getElementById("unit-switcher");
  let isTransitioning = false;

  const performUnitSwitch = async (targetUnit, href, pushHistory = true) => {
    const currentUnit = document.documentElement.getAttribute("data-unit") || "construtora";
    if (isTransitioning || !targetUnit || targetUnit === currentUnit) return;
    isTransitioning = true;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mainContent = document.getElementById("conteudo-principal");

    // 1. INSTANTÂNEO (0ms de atraso): Inicia a animação suave da logo e da bolha deslizante!
    document.documentElement.setAttribute("data-unit", targetUnit);
    syncThemeAndUnitLogos(targetUnit, undefined, { animate: true, mode: "unit" });

    if (switcher) {
      switcher.setAttribute("data-active-unit", targetUnit);
      switcher.querySelectorAll(".unit-switcher__item").forEach((item) => {
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

    try {
      const fetchPromise = fetchUnitDocument(href);
      const currentNav = document.getElementById("primary-nav");
      const navOutClass =
        targetUnit === "locadora" ? "is-nav-out-left" : "is-nav-out-right";
      const navInClass =
        targetUnit === "locadora" ? "is-nav-in-right" : "is-nav-in-left";

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
          targetUnit === "locadora" ? "is-exiting-to-locadora" : "is-exiting-to-construtora";
        mainContent.classList.add(exitClass);
        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }

      const htmlText = await fetchPromise;
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
            targetUnit === "locadora" ? "is-entering-from-right" : "is-entering-from-left";
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
        const attrName = `data-${targetUnit === "locadora" ? "locadora" : "construtora"}-${
          theme === "light" ? "light" : "dark"
        }`;
        const targetSrc = footerLogo.getAttribute(attrName);
        if (targetSrc) footerLogo.setAttribute("src", targetSrc);
      }

      if (pushHistory) {
        window.history.pushState({ unit: targetUnit, href }, "", href);
      }

      window.scrollTo({ top: 0, behavior: "instant" });

      if (window.htmx) {
        window.htmx.process(document.body);
      }
      if (typeof window.initScene3dObra === "function") {
        window.initScene3dObra();
      }
      initScrollRevealAndFallbackProgress();
      initFilterPillsState();
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
    const currentUnit = document.documentElement.getAttribute("data-unit") || "construtora";
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
    document.body.style.overflow = open ? "hidden" : "";
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

const initDialogManager = () => {
  const dialog = document.getElementById("modal-dinamico");
  if (!dialog || dialog.dataset.dialogBound === "true") return;
  dialog.dataset.dialogBound = "true";

  dialog.querySelectorAll("[data-dialog-close]").forEach((btn) => {
    btn.addEventListener("click", () => dialog.close());
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  document.body.addEventListener("htmx:afterSwap", (event) => {
    if (event.detail?.target?.id === "modal-conteudo" && !dialog.open) {
      dialog.showModal();
    }
  });
};

const bootstrapRochaApp = () => {
  preloadBrandLogos();
  initThemeSwitcher();
  initUnitSwitcherTransition();
  initMobileDrawer();
  initDialogManager();
  initScrollRevealAndFallbackProgress();
  initFilterPillsState();
  prefetchOtherUnit();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapRochaApp);
} else {
  bootstrapRochaApp();
}
