/**
 * Rocha Construtora — UX Interativa do Simulador Habitacional (`simulator-ui.js`).
 *
 * Responsabilidades:
 * 1. Máscara monetária brasileira (`R$ 3.500,00`) nos campos `[data-brl-mask="true"]`;
 * 2. Controles deslizantes progressivos sincronizados bidirecionalmente (`[data-range-for]`);
 * 3. Pílulas rápidas de prazo (`180`, `300`, `360`, `420` meses);
 * 4. Botão funcional "Restaurar padrões" (`[data-simulador-reset="true"]`) pós-HTMX;
 * 5. Ciclo de vida determinístico `mountSimulatorUI(root)` / `disposeSimulatorUI()`
 *    com zero mutação `element.style.*` (`style-src-attr 'none'`).
 */

const SIM_DEFAULTS = Object.freeze({
  modalidade: "terreno_construcao",
  renda_familiar: 3500,
  valor_obra: 220000,
  entrada_fgts: 25000,
  prazo_meses: 360,
  sistema_amortizacao: "SAC",
  possui_fgts: "sim",
  possui_dependentes: "sim",
  nome: "",
  telefone: "",
  cidade_obra: "Viçosa do Ceará - CE",
});

const MIN_SUBMIT_GUARD_MS = 1280;

/** @type {AbortController | null} */
let activeAbortController = null;
/** @type {number | null} */
let pendingSubmitTimer = null;
/** @type {number} */
let formMountedAt = 0;

/**
 * Formata número inteiro/decimal em reais (`R$ 3.500,00`).
 * @param {number} amount
 * @returns {string}
 */
function formatNumberToBRL(amount) {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const fixed = safe.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${grouped},${decPart}`;
}

/**
 * Extrai valor numérico a partir de string BRL (`"R$ 3.500,00"` -> `3500`) ou dígitos digitados.
 * @param {string} raw
 * @param {boolean} [treatDigitsAsCents=false]
 * @returns {number}
 */
function parseBRLInput(raw, treatDigitsAsCents = false) {
  const text = String(raw || "").trim();
  if (!text) return 0;

  if (treatDigitsAsCents) {
    const digits = text.replace(/\D/g, "");
    if (!digits) return 0;
    return Number.parseInt(digits, 10) / 100;
  }

  const cleaned = text.replace(/[rR]\$|\s/g, "");
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const val = Number.parseFloat(normalized);
    return Number.isFinite(val) ? val : 0;
  }
  const val = Number.parseFloat(cleaned);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Dispara submissão HTMX respeitando a janela mínima anti-bot (`1.2s`) do `TimestampSigner`.
 * @param {HTMLFormElement | null} form
 */
function requestSafeFormSubmit(form) {
  if (!form) return;
  if (pendingSubmitTimer !== null) {
    window.clearTimeout(pendingSubmitTimer);
    pendingSubmitTimer = null;
  }

  const elapsed = performance.now() - formMountedAt;
  const waitMs = Math.max(0, MIN_SUBMIT_GUARD_MS - elapsed);

  const fire = () => {
    pendingSubmitTimer = null;
    if (!form.isConnected) return;
    if (window.htmx && typeof window.htmx.trigger === "function") {
      window.htmx.trigger(form, "submit");
    } else if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    }
  };

  if (waitMs > 0) {
    pendingSubmitTimer = window.setTimeout(fire, Math.ceil(waitMs));
  } else {
    fire();
  }
}

/**
 * Injeta e sincroniza controles deslizantes acessíveis abaixo dos campos monetários Crispy.
 * @param {HTMLFormElement} form
 * @param {AbortSignal} signal
 */
function bindCurrencyFieldsAndSliders(form, signal) {
  const currencyInputs = Array.from(form.querySelectorAll('input[data-brl-mask="true"]'));

  currencyInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;

    const initialNumeric = parseBRLInput(input.value, false);
    if (input.value.trim()) {
      input.value = formatNumberToBRL(initialNumeric);
    }

    const min = Number(input.dataset.sliderMin || 0);
    const max = Number(input.dataset.sliderMax || 500000);
    const step = Number(input.dataset.sliderStep || 500);
    const fieldId = input.id || `sim-field-${input.name}`;

    let slider = form.querySelector(`input[data-range-for="${fieldId}"]`);
    if (!(slider instanceof HTMLInputElement)) {
      slider = document.createElement("input");
      slider.type = "range";
      slider.className = "sim-range-slider";
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step);
      slider.value = String(Math.min(max, Math.max(min, Math.round(initialNumeric))));
      slider.dataset.rangeFor = fieldId;
      const labelEl = form.querySelector(`label[for="${fieldId}"]`);
      const labelText = labelEl ? labelEl.textContent.replace(/\*/g, "").trim() : input.name;
      slider.setAttribute("aria-label", `Controle deslizante: ${labelText}`);
      input.insertAdjacentElement("afterend", slider);
    } else {
      slider.value = String(Math.min(max, Math.max(min, Math.round(initialNumeric))));
    }

    input.addEventListener(
      "input",
      () => {
        const numeric = parseBRLInput(input.value, true);
        input.value = numeric > 0 || input.value.replace(/\D/g, "") === "0" ? formatNumberToBRL(numeric) : "";
        const len = input.value.length;
        try {
          input.setSelectionRange(len, len);
        } catch (_err) {
          // Alguns navegadores móveis ignoram seleção em inputs específicos
        }
        if (slider instanceof HTMLInputElement) {
          slider.value = String(Math.min(max, Math.max(min, Math.round(numeric))));
        }
      },
      { signal }
    );

    input.addEventListener(
      "blur",
      () => {
        if (!input.value.trim() && input.name in SIM_DEFAULTS) {
          const fallback = SIM_DEFAULTS[input.name];
          if (typeof fallback === "number") {
            input.value = formatNumberToBRL(fallback);
            if (slider instanceof HTMLInputElement) {
              slider.value = String(Math.min(max, Math.max(min, fallback)));
            }
          }
        }
      },
      { signal }
    );

    slider.addEventListener(
      "input",
      () => {
        const val = Number(slider.value);
        input.value = formatNumberToBRL(val);
      },
      { signal }
    );

    slider.addEventListener(
      "change",
      () => {
        requestSafeFormSubmit(form);
      },
      { signal }
    );
  });
}

/**
 * Sincroniza as pílulas rápidas de prazo (`180`, `300`, `360`, `420`) com o input numérico.
 * @param {HTMLElement} workspace
 * @param {HTMLFormElement} form
 * @param {AbortSignal} signal
 */
function bindPrazoPresets(workspace, form, signal) {
  const prazoInput = form.querySelector('input[name="prazo_meses"]');
  const pills = Array.from(workspace.querySelectorAll("[data-prazo-preset]"));
  if (!(prazoInput instanceof HTMLInputElement) || !pills.length) return;

  const syncActivePill = () => {
    const current = String(prazoInput.value || "").trim();
    pills.forEach((btn) => {
      const match = btn.getAttribute("data-prazo-preset") === current;
      btn.classList.toggle("is-active", match);
      btn.setAttribute("aria-pressed", String(match));
    });
  };

  syncActivePill();

  pills.forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        const targetPrazo = btn.getAttribute("data-prazo-preset");
        if (!targetPrazo) return;
        prazoInput.value = targetPrazo;
        syncActivePill();
        requestSafeFormSubmit(form);
      },
      { signal }
    );
  });

  prazoInput.addEventListener("input", syncActivePill, { signal });
}

/**
 * Vincula o botão "Restaurar padrões" e selects de recálculo instantâneo.
 * @param {HTMLElement} workspace
 * @param {HTMLFormElement} form
 * @param {AbortSignal} signal
 */
function bindResetAndAutoSelects(workspace, form, signal) {
  const resetButtons = Array.from(workspace.querySelectorAll('[data-simulador-reset="true"]'));
  resetButtons.forEach((resetBtn) => {
    resetBtn.addEventListener(
      "click",
      () => {
        const setField = (name, val) => {
          const el = form.elements.namedItem(name);
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.value = val;
          }
        };

        setField("modalidade", SIM_DEFAULTS.modalidade);
        setField("renda_familiar", formatNumberToBRL(SIM_DEFAULTS.renda_familiar));
        setField("valor_obra", formatNumberToBRL(SIM_DEFAULTS.valor_obra));
        setField("entrada_fgts", formatNumberToBRL(SIM_DEFAULTS.entrada_fgts));
        setField("prazo_meses", String(SIM_DEFAULTS.prazo_meses));
        setField("sistema_amortizacao", SIM_DEFAULTS.sistema_amortizacao);
        setField("possui_fgts", SIM_DEFAULTS.possui_fgts);
        setField("possui_dependentes", SIM_DEFAULTS.possui_dependentes);
        setField("nome", SIM_DEFAULTS.nome);
        setField("telefone", SIM_DEFAULTS.telefone);
        setField("cidade_obra", SIM_DEFAULTS.cidade_obra);

        form.querySelectorAll('input[data-brl-mask="true"]').forEach((input) => {
          if (!(input instanceof HTMLInputElement)) return;
          const slider = form.querySelector(`input[data-range-for="${input.id}"]`);
          if (slider instanceof HTMLInputElement) {
            slider.value = String(Math.round(parseBRLInput(input.value, false)));
          }
        });

        workspace.querySelectorAll("[data-prazo-preset]").forEach((pill) => {
          const match = pill.getAttribute("data-prazo-preset") === String(SIM_DEFAULTS.prazo_meses);
          pill.classList.toggle("is-active", match);
          pill.setAttribute("aria-pressed", String(match));
        });

        requestSafeFormSubmit(form);
      },
      { signal }
    );
  });

  ["modalidade", "sistema_amortizacao", "possui_fgts", "possui_dependentes"].forEach((fieldName) => {
    const selectEl = form.elements.namedItem(fieldName);
    if (selectEl instanceof HTMLSelectElement) {
      selectEl.addEventListener(
        "change",
        () => {
          requestSafeFormSubmit(form);
        },
        { signal }
      );
    }
  });
}

/**
 * Monta (ou remonta após swap HTMX) todos os controles do simulador habitacional.
 * @param {ParentNode} [root=document]
 */
export function mountSimulatorUI(root = document) {
  disposeSimulatorUI();

  const workspace =
    root instanceof HTMLElement && root.matches("#simulador-workspace")
      ? root
      : root.querySelector?.("#simulador-workspace") || document.getElementById("simulador-workspace");
  if (!(workspace instanceof HTMLElement)) return;

  const form = workspace.querySelector("#form-simulacao-habitacional") || workspace.querySelector("form");
  if (!(form instanceof HTMLFormElement)) return;

  activeAbortController = new AbortController();
  formMountedAt = performance.now();
  const { signal } = activeAbortController;

  bindCurrencyFieldsAndSliders(form, signal);
  bindPrazoPresets(workspace, form, signal);
  bindResetAndAutoSelects(workspace, form, signal);
}

/**
 * Remove 100% dos listeners e timers ativos do simulador habitacional.
 */
export function disposeSimulatorUI() {
  if (pendingSubmitTimer !== null) {
    window.clearTimeout(pendingSubmitTimer);
    pendingSubmitTimer = null;
  }
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

if (!window.__rochaSimuladorGlobalSwapBound) {
  window.__rochaSimuladorGlobalSwapBound = true;
  document.addEventListener("htmx:afterSwap", (event) => {
    const target = event.detail?.target;
    if (
      target instanceof HTMLElement &&
      (target.id === "simulador-workspace" ||
        target.id === "container-simulacao" ||
        target.closest("#simulador-workspace"))
    ) {
      mountSimulatorUI(document);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountSimulatorUI(document), { once: true });
} else {
  mountSimulatorUI(document);
}
