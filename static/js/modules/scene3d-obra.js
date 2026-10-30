/**
 * Motor Interativo 3D & Coreografia de Rolagem — Rocha Construtora
 * Acelerado por hardware (transform + opacity via rAF), pausado fora de tela
 * e 100% aderente a @media (prefers-reduced-motion: reduce).
 */

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const initHeroCardTilt = () => {
  const card = document.getElementById("hero-card-3d");
  if (!card || prefersReducedMotion()) return;

  let frameId = null;

  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;

    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => {
      card.style.setProperty("--hero-rx", `${(-ny * 9).toFixed(2)}deg`);
      card.style.setProperty("--hero-ry", `${(nx * 11).toFixed(2)}deg`);
    });
  });

  card.addEventListener("pointerleave", () => {
    card.style.setProperty("--hero-rx", "0deg");
    card.style.setProperty("--hero-ry", "0deg");
  });
};

const initIsometricObraStage = () => {
  const model = document.getElementById("iso-house-model");
  const sceneWrap = document.getElementById("iso-scene-wrap");
  const explodeBtn = document.getElementById("toggle-exploded-3d");
  const statusLabel = document.getElementById("blueprint-stage-label");
  const progressBar = document.getElementById("obra-progress-fill");
  const stepCards = Array.from(document.querySelectorAll("[data-stage-order]"));

  if (!model || !stepCards.length) return;

  const layers = Array.from(model.querySelectorAll("[data-layer-order]"));

  const applyStage = (targetOrder, titleText, progressPct) => {
    const orderNum = Number(targetOrder) || 1;

    layers.forEach((layer) => {
      const layerNum = Number(layer.dataset.layerOrder);
      layer.classList.toggle("is-built", layerNum <= orderNum);
      layer.classList.toggle("is-current", layerNum === orderNum);
    });

    stepCards.forEach((card) => {
      const isMatch = Number(card.dataset.stageOrder) === orderNum;
      card.classList.toggle("is-active", isMatch);
      card.setAttribute("aria-current", isMatch ? "step" : "false");
    });

    if (statusLabel && titleText) {
      statusLabel.textContent = `Etapa 0${orderNum} · ${titleText}`;
    }

    if (progressBar && progressPct) {
      const ratio = Math.min(1, Math.max(0.1, Number(progressPct) / 100));
      progressBar.style.setProperty("--stage-progress", ratio.toFixed(2));
    }
  };

  // Inicializa com a Etapa 01 ativa
  const first = stepCards[0];
  applyStage(1, first.dataset.stageTitle, first.dataset.stageProgress);

  // Clique direto em cada etapa
  stepCards.forEach((card) => {
    card.addEventListener("click", () => {
      applyStage(
        card.dataset.stageOrder,
        card.dataset.stageTitle,
        card.dataset.stageProgress,
      );
    });
  });

  // Sincronização automática ao rolar pelas etapas (Scroll-Driven Storytelling)
  if ("IntersectionObserver" in window) {
    const stageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            applyStage(
              el.dataset.stageOrder,
              el.dataset.stageTitle,
              el.dataset.stageProgress,
            );
          }
        });
      },
      { rootMargin: "-28% 0px -48% 0px", threshold: 0.25 },
    );

    stepCards.forEach((card) => stageObserver.observe(card));
  }

  // Alternância de Vista Explodida 3D (CAD)
  if (explodeBtn) {
    explodeBtn.addEventListener("click", () => {
      const exploded = model.classList.toggle("is-exploded");
      explodeBtn.setAttribute("aria-pressed", String(exploded));
      const labelSpan = explodeBtn.querySelector("[data-explode-text]");
      if (labelSpan) {
        labelSpan.textContent = exploded ? "Compactar Camadas" : "Explodir Camadas 3D";
      }
    });
  }

  // Rotação Interativa do Palco Isométrico via ponteiro
  if (sceneWrap && !prefersReducedMotion()) {
    let rAF = null;
    sceneWrap.addEventListener("pointermove", (event) => {
      const rect = sceneWrap.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;

      if (rAF) cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        const rx = 58 - ny * 16;
        const rz = -42 + nx * 28;
        model.style.setProperty("--iso-rx", `${rx.toFixed(1)}deg`);
        model.style.setProperty("--iso-rz", `${rz.toFixed(1)}deg`);
      });
    });

    sceneWrap.addEventListener("pointerleave", () => {
      model.style.setProperty("--iso-rx", "58deg");
      model.style.setProperty("--iso-rz", "-42deg");
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initHeroCardTilt();
  initIsometricObraStage();
});

