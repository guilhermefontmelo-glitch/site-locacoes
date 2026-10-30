/**
 * Bootstrap Modular ES6+ — Rocha Construtora & Rocha Locações
 * Zero-Bloat: apenas interações essenciais de UI, acessibilidade (<dialog>/drawer),
 * alternância de tema Dark/Light e fallback passivo de progresso de rolagem.
 */

const initThemeSwitcher = () => {
  const toggleBtn = document.getElementById("theme-toggle");
  if (!toggleBtn) return;

  const syncAria = () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    toggleBtn.setAttribute("aria-pressed", String(current === "light"));
  };

  syncAria();

  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("rocha-theme", next);
    } catch {
      // Ignora indisponibilidade de storage em navegação privada restrita
    }
    syncAria();
  });
};

const initMobileDrawer = () => {
  const openBtn = document.getElementById("menu-toggle");
  const drawer = document.getElementById("mobile-drawer");
  if (!openBtn || !drawer) return;

  const setOpen = (open) => {
    drawer.hidden = !open;
    openBtn.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  };

  openBtn.addEventListener("click", () => {
    setOpen(drawer.hidden);
  });

  drawer.querySelectorAll("[data-drawer-close], [data-drawer-link]").forEach((el) => {
    el.addEventListener("click", () => setOpen(false));
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
  if (!dialog) return;

  dialog.querySelectorAll("[data-dialog-close]").forEach((btn) => {
    btn.addEventListener("click", () => dialog.close());
  });

  // Fecha ao clicar no backdrop externo do <dialog>
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  // Abre automaticamente o <dialog> após o HTMX injetar conteúdo em #modal-conteudo
  document.body.addEventListener("htmx:afterSwap", (event) => {
    if (event.detail?.target?.id === "modal-conteudo" && !dialog.open) {
      dialog.showModal();
    }
  });
};

const initScrollRevealAndFallbackProgress = () => {
  // Fallback leve em rAF caso o navegador ainda não suporte CSS animation-timeline: scroll()
  if (!CSS.supports("animation-timeline", "scroll()")) {
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

  const revealTargets = document.querySelectorAll("[data-reveal]");
  if (!revealTargets.length || !("IntersectionObserver" in window)) {
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
  if (!pillsWrap) return;

  pillsWrap.addEventListener("click", (event) => {
    const pill = event.target.closest(".filter-pill");
    if (!pill) return;
    pillsWrap.querySelectorAll(".filter-pill").forEach((el) => {
      el.classList.toggle("is-active", el === pill);
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  initThemeSwitcher();
  initMobileDrawer();
  initDialogManager();
  initScrollRevealAndFallbackProgress();
  initFilterPillsState();
});

