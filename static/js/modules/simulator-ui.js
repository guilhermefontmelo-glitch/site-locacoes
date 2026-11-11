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
  if (workspace instanceof HTMLElement) {
    const form = workspace.querySelector("#form-simulacao-habitacional") || workspace.querySelector("form");
    if (form instanceof HTMLFormElement) {
      activeAbortController = new AbortController();
      formMountedAt = performance.now();
      const { signal } = activeAbortController;

      bindCurrencyFieldsAndSliders(form, signal);
      bindPrazoPresets(workspace, form, signal);
      bindResetAndAutoSelects(workspace, form, signal);
    }
  }

  mountSimpleSimulator(root);
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
  disposeSimpleSimulator();
}

/* ==========================================================================
   MODO SIMPLES — ABAS + WIZARD DE 6 PERGUNTAS
   ========================================================================== */

/** @type {AbortController | null} */
let simpleAbortController = null;

const SIMPLE_TOTAL_STEPS = 6;

/**
 * Ativa uma aba do simulador (`simples` ou `avancada`).
 * @param {HTMLElement} app
 * @param {"simples" | "avancada"} target
 */
function ativarAbaSimulador(app, target) {
  const tabs = Array.from(app.querySelectorAll("[data-sim-tab]"));
  const panels = Array.from(app.querySelectorAll("[data-sim-panel]"));

  tabs.forEach((tab) => {
    const ativo = tab.getAttribute("data-sim-tab") === target;
    tab.classList.toggle("is-active", ativo);
    tab.setAttribute("aria-selected", String(ativo));
  });

  panels.forEach((panel) => {
    const ativo = panel.getAttribute("data-sim-panel") === target;
    panel.classList.toggle("is-active", ativo);
    if (ativo) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "");
    }
  });
}

/**
 * Exibe no painel avançado os valores respondidos no modo simples.
 * @param {HTMLElement} resultado
 */
function sincronizarComAvancado(resultado) {
  const form = document.getElementById("form-simulacao-habitacional");
  if (!(form instanceof HTMLFormElement)) return;

  const setValue = (name, value, formatar) => {
    const el = form.elements.namedItem(name);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    el.value = formatar ? formatNumberToBRL(Number(value || 0)) : String(value ?? "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  setValue("modalidade", resultado.dataset.avancadoModalidade || "terreno_construcao", false);
  setValue("renda_familiar", resultado.dataset.avancadoRenda || "3500", true);
  setValue("valor_obra", resultado.dataset.avancadoObra || "220000", true);
  setValue("entrada_fgts", resultado.dataset.avancadoEntrada || "25000", true);
  setValue("prazo_meses", resultado.dataset.avancadoPrazo || "360", false);

  form.querySelectorAll('input[data-brl-mask="true"]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const slider = form.querySelector(`input[data-range-for="${input.id}"]`);
    if (slider instanceof HTMLInputElement) {
      slider.value = String(Math.round(parseBRLInput(input.value, false)));
    }
  });

  form.querySelectorAll("[data-prazo-preset]").forEach((pill) => {
    const match = pill.getAttribute("data-prazo-preset") === String(resultado.dataset.avancadoPrazo || "360");
    pill.classList.toggle("is-active", match);
    pill.setAttribute("aria-pressed", String(match));
  });

  requestSafeFormSubmit(form);
}

/**
 * Formata os campos monetários do wizard simples de forma amigável.
 *
 * Diferente da máscara de centavos do modo avançado, aqui o visitante pode
 * digitar `3500` e receber `R$ 3.500,00` ao sair do campo, sem precisar
 * completar zeros de centavos.
 * @param {HTMLInputElement} input
 * @param {AbortSignal} signal
 */
function bindSimpleCurrency(input, signal) {
  const formatar = () => {
    const texto = input.value.trim();
    if (!texto) return;
    const valor = parseBRLInput(texto, false);
    if (valor > 0 || texto.replace(/\D/g, "") === "0") {
      input.value = formatNumberToBRL(valor);
    }
  };

  input.addEventListener("blur", formatar, { signal });

  input.addEventListener(
    "input",
    () => {
      const sanitizado = input.value.replace(/[^\d.,\s]/g, "");
      if (sanitizado !== input.value) {
        input.value = sanitizado;
      }
    },
    { signal }
  );
}

/**
 * Mostra os campos condicionais (valor da obra / entrada personalizada).
 * @param {HTMLElement} scope
 */
function atualizarCondicionaisSimples(scope) {
  scope.querySelectorAll("[data-sim-show-when]").forEach((box) => {
    const campo = box.getAttribute("data-sim-show-when");
    const valorAlvo = box.getAttribute("data-sim-show-value");
    const marcado = scope.querySelector(`input[name="${campo}"]:checked`);
    box.hidden = !(marcado && marcado.value === valorAlvo);
  });
}

/**
 * Exibe uma mensagem amigável dentro do passo atual.
 * @param {HTMLElement} step
 * @param {string} mensagem
 */
function mostrarErroPasso(step, mensagem) {
  let erro = step.querySelector("[data-sim-client-error]");
  if (!(erro instanceof HTMLElement)) {
    erro = document.createElement("div");
    erro.className = "sim-step__erro";
    erro.setAttribute("role", "alert");
    erro.dataset.simClientError = "";
    step.appendChild(erro);
  }
  erro.textContent = mensagem;
}

/**
 * Limpa os erros gerados no navegador dentro de um passo.
 * @param {HTMLElement} step
 */
function limparErroPasso(step) {
  step.querySelectorAll("[data-sim-client-error]").forEach((el) => el.remove());
}

/**
 * Validação amigável do passo antes de avançar.
 * @param {HTMLElement} step
 * @returns {boolean}
 */
function validarPassoSimples(step) {
  limparErroPasso(step);

  const radioGroups = new Set();
  step.querySelectorAll('input[type="radio"]').forEach((radio) => {
    if (radio instanceof HTMLInputElement) radioGroups.add(radio.name);
  });

  for (const grupo of radioGroups) {
    if (!step.querySelector(`input[name="${grupo}"]:checked`)) {
      mostrarErroPasso(step, "Escolha uma opção para continuar.");
      return false;
    }
  }

  const texto = step.querySelector('input[type="text"]:not([name="website"]):not([name="website_url_trap"])');
  if (texto instanceof HTMLInputElement) {
    const obrigatorio = texto.name === "renda_familiar";
    const condicionalValor =
      texto.name === "valor_casa" &&
      step.querySelector('input[name="tipo_casa"][value="valor"]:checked');
    const condicionalEntrada =
      texto.name === "entrada_valor" &&
      step.querySelector('input[name="entrada_faixa"][value="custom"]:checked');

    if ((obrigatorio || condicionalValor || condicionalEntrada) && !texto.value.trim()) {
      mostrarErroPasso(step, "Preencha este valor para continuar.");
      return false;
    }
  }

  return true;
}

/**
 * Monta as abas e o wizard simples, inclusive após swaps HTMX.
 * @param {ParentNode} [root=document]
 */
export function mountSimpleSimulator(root = document) {
  disposeSimpleSimulator();

  const app =
    root instanceof HTMLElement && root.matches("#simulador-app")
      ? root
      : root.querySelector?.("#simulador-app") || document.getElementById("simulador-app");
  if (!(app instanceof HTMLElement)) return;

  simpleAbortController = new AbortController();
  const { signal } = simpleAbortController;

  const tabs = Array.from(app.querySelectorAll("[data-sim-tab]"));
  tabs.forEach((tab) => {
    tab.addEventListener(
      "click",
      () => {
        const alvo = tab.getAttribute("data-sim-tab");
        if (alvo === "simples" || alvo === "avancada") {
          ativarAbaSimulador(app, alvo);
        }
      },
      { signal }
    );
  });

  const painelSimples = document.getElementById("simulador-simples");
  if (!(painelSimples instanceof HTMLElement)) return;

  painelSimples.querySelectorAll("[data-sim-ir-avancado]").forEach((botao) => {
    botao.addEventListener(
      "click",
      () => {
        const resultado = botao.closest("[data-sim-resultado]");
        if (resultado instanceof HTMLElement) {
          sincronizarComAvancado(resultado);
        }
        ativarAbaSimulador(app, "avancada");
      },
      { signal }
    );
  });

  const wizard = painelSimples.querySelector("[data-sim-wizard]");
  if (!(wizard instanceof HTMLFormElement)) return;

  const steps = Array.from(painelSimples.querySelectorAll("[data-sim-step]"));
  if (!steps.length) return;

  const progress = painelSimples.querySelector("[data-sim-progress]");
  const stepLabel = painelSimples.querySelector("[data-sim-step-label]");
  const btnBack = wizard.querySelector("[data-sim-back]");
  const btnNext = wizard.querySelector("[data-sim-next]");
  const btnSubmit = wizard.querySelector("[data-sim-submit]");

  let atual = 0;

  const renderStep = (indice) => {
    atual = Math.min(Math.max(indice, 0), steps.length - 1);
    steps.forEach((step, idx) => {
      step.hidden = idx !== atual;
    });

    if (progress instanceof HTMLProgressElement) {
      progress.value = atual + 1;
    }
    if (stepLabel instanceof HTMLElement) {
      stepLabel.textContent = steps[atual].getAttribute("data-sim-label") || `Pergunta ${atual + 1} de ${steps.length}`;
    }
    if (btnBack instanceof HTMLElement) {
      btnBack.hidden = atual === 0;
    }
    if (btnNext instanceof HTMLElement) {
      btnNext.hidden = atual === steps.length - 1;
    }
    if (btnSubmit instanceof HTMLElement) {
      btnSubmit.hidden = atual !== steps.length - 1;
    }
  };

  // Erros do backend: abre o primeiro passo que contém erro.
  const passoComErro = steps.findIndex((step) => step.querySelector(".sim-step__erro"));
  renderStep(passoComErro >= 0 ? passoComErro : 0);

  wizard.querySelectorAll("[data-simples-brl]").forEach((input) => {
    if (input instanceof HTMLInputElement) bindSimpleCurrency(input, signal);
  });

  const atualizarTudo = () => atualizarCondicionaisSimples(wizard);
  atualizarTudo();

  wizard.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", atualizarTudo, { signal });
  });

  if (btnNext instanceof HTMLElement) {
    btnNext.addEventListener(
      "click",
      () => {
        const step = steps[atual];
        if (step instanceof HTMLElement && validarPassoSimples(step)) {
          renderStep(atual + 1);
        }
      },
      { signal }
    );
  }

  if (btnBack instanceof HTMLElement) {
    btnBack.addEventListener("click", () => renderStep(atual - 1), { signal });
  }

  wizard.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && atual < steps.length - 1) {
        event.preventDefault();
        const step = steps[atual];
        if (step instanceof HTMLElement && validarPassoSimples(step)) {
          renderStep(atual + 1);
        }
      }
    },
    { signal }
  );

  const sincronizarProgresso = () => {
    if (progress instanceof HTMLProgressElement) {
      progress.max = steps.length;
    }
  };
  sincronizarProgresso();
}

/**
 * Remove os listeners do modo simples.
 */
export function disposeSimpleSimulator() {
  if (simpleAbortController) {
    simpleAbortController.abort();
    simpleAbortController = null;
  }
}

if (!window.__rochaSimuladorGlobalSwapBound) {
  window.__rochaSimuladorGlobalSwapBound = true;
  document.addEventListener("htmx:afterSwap", (event) => {
    const target = event.detail?.target;
    if (!(target instanceof HTMLElement)) return;

    if (
      target.id === "simulador-workspace" ||
      target.id === "container-simulacao" ||
      target.closest("#simulador-workspace")
    ) {
      mountSimulatorUI(document);
      return;
    }

    if (
      target.id === "simulador-simples-conteudo" ||
      target.closest("[data-sim-simples]") ||
      target.id === "simulador-app"
    ) {
      mountSimpleSimulator(document);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountSimulatorUI(document), { once: true });
} else {
  mountSimulatorUI(document);
}
