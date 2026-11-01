/**
 * Rocha Construtora & Rocha Locações — Motor WAAPI Compositor-Only (`waapi-driver.js`).
 *
 * Opera 100% na pilha de composição via `KeyframeEffect` e `Element.animate()`,
 * sem mutar `element.style.*` nem chamar `Animation.commitStyles()`, garantindo
 * compatibilidade total com `Content-Security-Policy: style-src-attr 'none'`.
 */

const DEFAULT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const SCRUB_DURATION_MS = 1000;

/**
 * Registra uma instância `Animation` em um `Set` de ciclo de vida, se fornecido.
 * @param {Animation | null} anim
 * @param {Set<Animation> | null | undefined} registry
 * @returns {Animation | null}
 */
function registerAnimation(anim, registry) {
  if (anim && registry instanceof Set) {
    registry.add(anim);
  }
  return anim;
}

/**
 * Cria um scrubber contínuo (`0..1`) baseado em `scaleX` ou `scaleY` acelerado por GPU.
 * @param {Element | null} element
 * @param {"X" | "Y"} [axis="X"]
 * @param {Set<Animation> | null} [registry=null]
 */
export function createProgressScrubber(element, axis = "X", registry = null) {
  if (!element || typeof KeyframeEffect === "undefined" || typeof Animation === "undefined") {
    return {
      setProgress() {},
      cancel() {},
    };
  }

  const fn = axis === "Y" ? "scaleY" : "scaleX";
  const effect = new KeyframeEffect(
    element,
    [{ transform: `${fn}(0)` }, { transform: `${fn}(1)` }],
    {
      duration: SCRUB_DURATION_MS,
      fill: "both",
      easing: "linear",
    }
  );
  const anim = new Animation(effect, document.timeline);
  anim.pause();
  anim.currentTime = 0;
  registerAnimation(anim, registry);

  return {
    /** @param {number} ratio */
    setProgress(ratio) {
      const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
      anim.currentTime = clamped * SCRUB_DURATION_MS;
    },
    cancel() {
      try {
        anim.cancel();
      } catch (_err) {
        // Ignora caso o nó já tenha sido desconectado
      }
      if (registry instanceof Set) {
        registry.delete(anim);
      }
    },
  };
}

/**
 * Controla `transform` e `opacity` dinamicamente em `rAF` sem tocar em `element.style`.
 * @param {Element | null} element
 * @param {string} [initialTransform="none"]
 * @param {Set<Animation> | null} [registry=null]
 */
export function createTransformController(element, initialTransform = "none", registry = null) {
  if (!element || typeof KeyframeEffect === "undefined" || typeof Animation === "undefined") {
    return {
      setTransform() {},
      setFrame() {},
      cancel() {},
    };
  }

  const effect = new KeyframeEffect(
    element,
    [{ transform: initialTransform }, { transform: initialTransform }],
    {
      duration: 1,
      fill: "both",
      easing: "linear",
    }
  );
  const anim = new Animation(effect, document.timeline);
  anim.pause();
  anim.currentTime = 1;
  registerAnimation(anim, registry);

  return {
    /** @param {string} transformValue */
    setTransform(transformValue) {
      effect.setKeyframes([{ transform: transformValue }, { transform: transformValue }]);
    },
    /** @param {Keyframe} frame */
    setFrame(frame) {
      effect.setKeyframes([frame, frame]);
    },
    cancel() {
      try {
        anim.cancel();
      } catch (_err) {
        // Ignora caso o nó já tenha sido removido
      }
      if (registry instanceof Set) {
        registry.delete(anim);
      }
    },
  };
}

/**
 * Executa transição discreta WAAPI com curva editorial sem `commitStyles()`.
 * @param {Element | null} element
 * @param {Keyframe[] | PropertyIndexedKeyframes} keyframes
 * @param {KeyframeAnimationOptions} [options={}]
 * @param {Set<Animation> | null} [registry=null]
 * @returns {Animation | null}
 */
export function animateOnce(element, keyframes, options = {}, registry = null) {
  if (!element || typeof element.animate !== "function") {
    return null;
  }
  const anim = element.animate(keyframes, {
    duration: 560,
    easing: DEFAULT_EASING,
    fill: "both",
    ...options,
  });
  return registerAnimation(anim, registry);
}

/**
 * Cancela e limpa todas as animações WAAPI registradas em um `Set`.
 * @param {Set<Animation> | null | undefined} registry
 */
export function cancelRegistry(registry) {
  if (!(registry instanceof Set)) return;
  registry.forEach((anim) => {
    try {
      anim.cancel();
    } catch (_err) {
      // Nó já descartado
    }
  });
  registry.clear();
}
