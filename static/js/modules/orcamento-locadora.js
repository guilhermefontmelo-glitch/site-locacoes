/**
 * Sincroniza os cards do catálogo com o formulário de orçamento:
 * - incluir/remover o equipamento na seleção do formulário;
 * - exibir o seletor de quantidade apenas quando marcado;
 * - respeitar o limite disponível e enviar `qtd_<slug>` no POST.
 */
(function () {
  "use strict";

  function obterFormulario() {
    return document.querySelector("#orcamento-locadora-box form");
  }

  function campoSelecao(form, slug) {
    return form.querySelector('input[name="equipamentos"][value="' + slug + '"]');
  }

  function campoQuantidade(form, slug, criar) {
    var nome = "qtd_" + slug;
    var campo = form.querySelector('input[name="' + nome + '"]');
    if (!campo && criar) {
      campo = document.createElement("input");
      campo.type = "hidden";
      campo.name = nome;
      campo.value = "1";
      form.appendChild(campo);
    }
    return campo;
  }

  function removerQuantidade(form, slug) {
    var campo = campoQuantidade(form, slug, false);
    if (campo) campo.remove();
  }

  function mostrarAviso(container) {
    var aviso = container.querySelector("[data-qty-aviso]");
    if (!aviso) return;
    aviso.hidden = false;
    window.clearTimeout(aviso._timer);
    aviso._timer = window.setTimeout(function () {
      aviso.hidden = true;
    }, 2200);
  }

  function definirQuantidade(form, container, wrap, valor) {
    var maximo = parseInt(wrap.getAttribute("data-max"), 10) || 1;
    var limitado = Math.min(maximo, Math.max(1, valor));
    if (valor > maximo) mostrarAviso(container);

    wrap.setAttribute("data-value", String(limitado));
    var saida = wrap.querySelector("[data-qty-value]");
    if (saida) saida.textContent = String(limitado);
    campoQuantidade(form, wrap.getAttribute("data-slug"), true).value = String(limitado);
    return limitado;
  }

  function sincronizar() {
    var form = obterFormulario();
    if (!form) return;

    document.querySelectorAll("[data-equip-toggle]").forEach(function (toggle) {
      var selecao = campoSelecao(form, toggle.value);
      var marcado = Boolean(selecao && selecao.checked);
      toggle.checked = marcado;

      var container = toggle.closest(".equip-card__select");
      if (!container) return;

      var wrap = container.querySelector("[data-equip-qty]");
      if (!wrap) return;

      var slug = wrap.getAttribute("data-slug");
      if (marcado) {
        var campo = campoQuantidade(form, slug, false);
        var atual = campo
          ? parseInt(campo.value, 10) || 1
          : parseInt(wrap.getAttribute("data-value"), 10) || 1;
        definirQuantidade(form, container, wrap, atual);
      } else {
        removerQuantidade(form, slug);
        wrap.setAttribute("data-value", "1");
        var saida = wrap.querySelector("[data-qty-value]");
        if (saida) saida.textContent = "1";
      }
    });
  }

  document.addEventListener("change", function (evento) {
    var toggle = evento.target.closest("[data-equip-toggle]");
    if (!toggle) return;
    var form = obterFormulario();
    if (!form) return;

    var selecao = campoSelecao(form, toggle.value);
    if (selecao) selecao.checked = toggle.checked;
    sincronizar();
  });

  document.addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-qty-plus], [data-qty-minus]");
    if (!botao) return;

    var form = obterFormulario();
    var wrap = botao.closest("[data-equip-qty]");
    var container = botao.closest(".equip-card__select");
    if (!form || !wrap || !container) return;

    evento.preventDefault();

    var toggle = container.querySelector("[data-equip-toggle]");
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      var selecao = campoSelecao(form, toggle.value);
      if (selecao) selecao.checked = true;
    }

    var atual = parseInt(wrap.getAttribute("data-value"), 10) || 1;
    var delta = botao.hasAttribute("data-qty-plus") ? 1 : -1;
    definirQuantidade(form, container, wrap, atual + delta);
    sincronizar();
  });

  document.addEventListener("change", function (evento) {
    if (evento.target.name === "equipamentos") sincronizar();
  });

  document.addEventListener("htmx:afterSwap", sincronizar);
  document.addEventListener("htmx:afterSettle", sincronizar);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sincronizar);
  } else {
    sincronizar();
  }
})();
