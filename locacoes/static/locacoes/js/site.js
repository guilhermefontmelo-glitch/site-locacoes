/* COMPORTAMENTO DO SITE: WhatsApp, lista de equipamentos, menu, animações. */
    /* ===== CONFIGURAÇÃO: troque aqui ===== */
    var WHATSAPP = "5588994248183"; /* Douglas: (88) 99424-8183 — 55 + DDD + número, sem espaços nem traços */

    /* Lista de equipamentos: para adicionar um item, copie uma linha */
    var EQUIPAMENTOS = [
      { grupo: "Estruturas e acesso", nome: "Andaimes", desc: "Para fachadas, pinturas, reboco e acabamentos em altura." },
      { grupo: "Estruturas e acesso", nome: "Escoras", desc: "Sustentação de lajes, vigas e fôrmas durante a concretagem." },
      { grupo: "Concretagem", nome: "Betoneira", desc: "Mistura de concreto e argamassa direto no canteiro." },
      { grupo: "Concretagem", nome: "Vibrador de concreto", desc: "Adensamento do concreto, evitando falhas e vazios nas peças." },
      { grupo: "Elevação", nome: "Guincho elétrico", desc: "Elevação de materiais entre pavimentos com segurança." },
      { grupo: "Ferramentas elétricas", nome: "Martelete", desc: "Perfuração e demolição em concreto e alvenaria." },
      { grupo: "Ferramentas elétricas", nome: "Esmerilhadeira", desc: "Corte e desbaste de metais e materiais de construção." },
      { grupo: "Ferramentas elétricas", nome: "Serra circular", desc: "Cortes precisos em madeira, como fôrmas e telhados." }
    ];

    function zeros(n) { return (n < 10 ? "0" : "") + n; }
    function linkZap(texto) { return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(texto); }

    /* ===== Links do WhatsApp ===== */
    document.querySelectorAll("[data-zap]").forEach(function (a) {
      a.href = linkZap(a.getAttribute("data-zap"));
      a.target = "_blank";
      a.rel = "noopener";
    });

    /* ===== Menu ===== */
    var menu = document.getElementById("menu");
    var abrir = document.getElementById("abrirMenu");
    function trocarMenu(aberto) {
      menu.classList.toggle("aberto", aberto);
      abrir.setAttribute("aria-expanded", aberto);
    }
    abrir.onclick = function () { trocarMenu(true); };
    document.getElementById("fecharMenu").onclick = function () { trocarMenu(false); };
    menu.querySelectorAll("a").forEach(function (a) { a.onclick = function () { trocarMenu(false); }; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") trocarMenu(false); });

    /* ===== Carrossel de equipamentos ===== */
    var trilho = document.getElementById("trilho");
    EQUIPAMENTOS.forEach(function (e, i) {
      var c = document.createElement("article");
      c.className = "cartao";
      c.innerHTML =
        '<div class="cartao-topo"><b>' + e.grupo + '</b><span>' + zeros(i + 1) + '</span></div>' +
        '<h3>' + e.nome + '</h3>' +
        '<p>' + e.desc + '</p>' +
        '<a class="botao-cartao" target="_blank" rel="noopener" href="' +
          linkZap("Olá! Gostaria de um orçamento de locação: " + e.nome) + '">Solicitar orçamento <span>&#8599;</span></a>';
      trilho.appendChild(c);
    });
    var cartoes = Array.prototype.slice.call(trilho.children);
    var contador = document.getElementById("contador");
    function passo() { return cartoes[0].offsetWidth + 16; }
    function atualizarContador() {
      var i = Math.min(cartoes.length - 1, Math.round(trilho.scrollLeft / passo()));
      contador.textContent = zeros(i + 1) + " / " + zeros(cartoes.length);
    }
    trilho.addEventListener("scroll", atualizarContador, { passive: true });
    document.getElementById("anterior").onclick = function () { trilho.scrollBy({ left: -passo(), behavior: "smooth" }); };
    document.getElementById("proximo").onclick = function () { trilho.scrollBy({ left: passo(), behavior: "smooth" }); };
    atualizarContador();

    /* ===== Barra de progresso ===== */
    var barra = document.getElementById("barra");

    function atualizar() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      barra.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
        var alvos = document.querySelectorAll(".equipamentos .miolo, .numeros > div, .impacto h2, .etapas .miolo > *, .etapas li, .chamada-caixa");
    alvos.forEach(function (el) { el.classList.add("revela"); });
    if ("IntersectionObserver" in window) {
      var vigia = new IntersectionObserver(function (itens) {
        itens.forEach(function (it) { if (it.isIntersecting) { it.target.classList.add("vis"); vigia.unobserve(it.target); } });
      }, { threshold: 0.15 });
      alvos.forEach(function (el) { vigia.observe(el); });
    } else { alvos.forEach(function (el) { el.classList.add("vis"); }); }

    window.addEventListener("scroll", atualizar, { passive: true });
    window.addEventListener("resize", atualizar);
    atualizar();
