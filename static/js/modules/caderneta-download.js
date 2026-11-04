/**
 * Download automático da Caderneta de Contas em PDF — Rocha Locações.
 *
 * O formulário de orçamento continua usando HTMX. Quando o pedido é válido, o
 * servidor devolve a confirmação com um link assinado para o PDF; este módulo
 * busca esse PDF uma única vez, guarda em memória e inicia o download
 * automático, sem trocar o fluxo atual do WhatsApp.
 *
 * Responsabilidades:
 * - validar no navegador antes de enviar (equipamento, período e entrega);
 * - mostrar "Gerando PDF..." e desabilitar o botão durante a requisição;
 * - disparar o download assim que a confirmação chega;
 * - permitir baixar de novo pelo botão dourado ou pelo "baixe aqui";
 * - exibir mensagens de erro amigáveis abaixo do botão.
 */

const FORM_SELECTOR = "#orcamento-locadora-box form.rocha-crispy-form";
const TEXTO_CARREGANDO = "Gerando PDF...";
const ERRO_GENERICO = "Não foi possível gerar o PDF agora. Tente novamente em instantes.";

let inicializado = false;
let urlOrcamentoPdf = "";
let nomeArquivoPdf = "";
let geracaoPdf = 0;

/**
 * Descobre o formulário de orçamento a partir do elemento que disparou o evento.
 * @param {Event} event
 * @returns {HTMLFormElement | null}
 */
const formularioDoEvento = (event) => {
  const elemento = event.detail?.elt;
  if (elemento instanceof Element) {
    const form = elemento.closest("form.rocha-crispy-form");
    if (form instanceof HTMLFormElement) return form;
  }
  return null;
};

/**
 * Cria (uma única vez) o parágrafo de status logo abaixo do botão de envio.
 * @param {HTMLFormElement} form
 * @returns {HTMLParagraphElement | null}
 */
const obterMensagem = (form) => {
  const acoes = form.querySelector(".rocha-form-actions");
  if (!acoes) return null;

  let mensagem = acoes.querySelector("[data-caderneta-mensagem]");
  if (!(mensagem instanceof HTMLParagraphElement)) {
    mensagem = document.createElement("p");
    mensagem.dataset.cadernetaMensagem = "";
    mensagem.className = "text-xs mt-2 hidden";
    mensagem.setAttribute("role", "status");
    mensagem.setAttribute("aria-live", "polite");
    acoes.appendChild(mensagem);
  }
  return mensagem;
};

/**
 * Escreve o status abaixo do botão, usando as cores do site (dourado/vermelho).
 * @param {HTMLFormElement} form
 * @param {string} texto
 * @param {"erro" | "sucesso" | ""} tipo
 */
const mostrarMensagem = (form, texto, tipo) => {
  const mensagem = obterMensagem(form);
  if (!mensagem) return;

  mensagem.textContent = texto;
  mensagem.classList.toggle("hidden", !texto);
  mensagem.classList.toggle("text-red-500", Boolean(texto) && tipo === "erro");
  mensagem.classList.toggle("text-gold", Boolean(texto) && tipo === "sucesso");
};

/**
 * Valida o pedido no navegador para evitar uma ida ao servidor sem necessidade.
 * @param {HTMLFormElement} form
 * @returns {string} mensagem de erro ou string vazia quando está tudo certo
 */
const validarPedido = (form) => {
  const equipamentos = form.querySelectorAll('input[name="equipamentos"]:checked');
  if (equipamentos.length === 0) {
    return "Selecione ao menos um equipamento para gerar o orçamento.";
  }

  const periodo = form.querySelector('select[name="periodo"]');
  if (!periodo || !periodo.value) {
    return "Escolha o período estimado de locação.";
  }

  const entrega = form.querySelector('select[name="modalidade_entrega"]');
  if (!entrega || !entrega.value) {
    return "Informe se a entrega será na obra ou a retirada na sede.";
  }

  return "";
};

/**
 * Alterna o botão de envio entre o estado normal e "Gerando PDF...".
 * @param {HTMLFormElement} form
 * @param {boolean} carregando
 */
const alternarCarregando = (form, carregando) => {
  const botao = form.querySelector('button[type="submit"]');
  if (!(botao instanceof HTMLButtonElement)) return;

  const rotulo = botao.querySelector("span");
  if (carregando) {
    botao.dataset.textoOriginal = rotulo?.textContent ?? "";
    if (rotulo) rotulo.textContent = TEXTO_CARREGANDO;
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    return;
  }

  if (rotulo && botao.dataset.textoOriginal) {
    rotulo.textContent = botao.dataset.textoOriginal;
  }
  botao.disabled = false;
  botao.removeAttribute("aria-busy");
};

/**
 * Libera a URL temporária do PDF e invalida downloads antigos em andamento.
 */
const limparPdf = () => {
  geracaoPdf += 1;
  if (urlOrcamentoPdf) {
    URL.revokeObjectURL(urlOrcamentoPdf);
  }
  urlOrcamentoPdf = "";
  nomeArquivoPdf = "";
};

/**
 * Lê o nome do arquivo que o servidor envia em Content-Disposition.
 * @param {Response} resposta
 * @returns {string}
 */
const nomeArquivoDoServidor = (resposta) => {
  const cabecalho = resposta.headers.get("content-disposition") || "";
  const encontrado = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecalho);
  if (!encontrado) return "";

  try {
    return decodeURIComponent(encontrado[1].trim());
  } catch {
    return encontrado[1].trim();
  }
};

/**
 * Nome de reserva caso o servidor não envie Content-Disposition.
 * @returns {string}
 */
const nomeArquivoPadrao = () => {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `Orcamento_Rocha_${dia}-${mes}-${hoje.getFullYear()}.pdf`;
};

/**
 * Baixa o PDF já guardado em memória, sem nova requisição ao servidor.
 * @returns {boolean} true quando havia um PDF pronto para baixar
 */
const baixarPdf = () => {
  if (!urlOrcamentoPdf) return false;

  const link = document.createElement("a");
  link.href = urlOrcamentoPdf;
  link.download = nomeArquivoPdf || nomeArquivoPadrao();
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
};

/**
 * Esconde o botão de download e mostra a mensagem de falha, sem afetar o WhatsApp.
 * @param {HTMLElement} container
 */
const mostrarErroPdf = (container) => {
  const botao = container.querySelector("[data-caderneta-baixar]");
  if (botao instanceof HTMLElement) botao.hidden = true;

  const erro = container.querySelector("[data-caderneta-erro]");
  if (erro instanceof HTMLElement) erro.hidden = false;
};

/**
 * Busca o PDF uma única vez, guarda o blob e inicia o download automático.
 * O botão dourado e o "baixe aqui" reaproveitam essa mesma URL depois.
 * @param {HTMLElement} container
 * @param {string} href
 */
const prepararPdf = async (container, href) => {
  const geracaoAtual = ++geracaoPdf;

  try {
    const resposta = await fetch(href, { credentials: "same-origin" });
    if (!resposta.ok) throw new Error(`Falha ao gerar o PDF (${resposta.status}).`);

    const blob = await resposta.blob();
    if (!blob.size) throw new Error("O PDF voltou vazio.");

    // Uma nova confirmação chegou enquanto este download acontecia: descarta.
    if (geracaoAtual !== geracaoPdf) return;

    urlOrcamentoPdf = URL.createObjectURL(blob);
    nomeArquivoPdf = nomeArquivoDoServidor(resposta) || nomeArquivoPadrao();

    const botao = container.querySelector("[data-caderneta-baixar]");
    if (botao instanceof HTMLElement) botao.hidden = false;

    baixarPdf();
  } catch {
    if (geracaoAtual !== geracaoPdf) return;
    mostrarErroPdf(container);
  }
};

/**
 * Clique no botão dourado ou no "baixe aqui": reaproveita o PDF guardado.
 * @param {Event} event
 */
const aoClicarDownload = (event) => {
  const alvo = event.target;
  if (!(alvo instanceof Element)) return;

  const gatilho = alvo.closest("[data-caderneta-baixar], [data-caderneta-baixe-aqui]");
  if (!gatilho) return;

  // Sem PDF guardado (falha anterior), o link do servidor continua valendo.
  if (baixarPdf()) event.preventDefault();
};

/**
 * Ao montar outra lista, libera a memória usada pelo PDF guardado.
 * @param {Event} event
 */
const aoReiniciar = (event) => {
  const alvo = event.target;
  if (!(alvo instanceof Element)) return;

  const link = alvo.closest("[data-caderneta-reiniciar]");
  if (!link) return;

  limparPdf();

  // O link aponta para a mesma página com #orcamento. Só trocar o hash não
  // recarrega o documento, então o cartão de resultado continuaria na tela.
  const destino = new URL(link.href, window.location.href);
  const mesmaPagina =
    destino.pathname === window.location.pathname &&
    destino.search === window.location.search;

  if (mesmaPagina) {
    event.preventDefault();
    window.location.hash = destino.hash;
    window.location.reload();
  }
};

/**
 * Antes de qualquer requisição HTMX: valida os campos e liga o estado de carga.
 * @param {Event} event
 */
const aoConfirmar = (event) => {
  const form = formularioDoEvento(event);
  if (!form || !form.matches(FORM_SELECTOR)) return;

  const erro = validarPedido(form);
  if (erro) {
    event.preventDefault();
    mostrarMensagem(form, erro, "erro");
    return;
  }

  mostrarMensagem(form, "", "");
  alternarCarregando(form, true);
};

/**
 * Mostra o erro do servidor (JSON `{"erro": "..."}`) ou uma mensagem genérica.
 * @param {Event} event
 */
const aoFalhar = (event) => {
  const form = formularioDoEvento(event) || document.querySelector(FORM_SELECTOR);
  if (!(form instanceof HTMLFormElement)) return;

  alternarCarregando(form, false);

  let texto = ERRO_GENERICO;
  const xhr = event.detail?.xhr;
  if (xhr?.responseText) {
    try {
      const dados = JSON.parse(xhr.responseText);
      if (dados && typeof dados.erro === "string" && dados.erro) {
        texto = dados.erro;
      }
    } catch {
      // Resposta não era JSON: mantém a mensagem genérica.
    }
  }
  mostrarMensagem(form, texto, "erro");
};

/**
 * Depois que a confirmação substitui o formulário, dispara o download do PDF.
 * @param {Event} event
 */
const aoDepoisDoSwap = (event) => {
  const alvo = event.detail?.target;
  if (!(alvo instanceof HTMLElement) || alvo.id !== "orcamento-locadora-box") return;

  limparPdf();

  const link = alvo.querySelector("[data-caderneta-pdf]");
  if (link instanceof HTMLAnchorElement && link.href) {
    prepararPdf(alvo, link.href);
  }
};

/**
 * Liga os listeners globais uma única vez. Usa delegação para continuar
 * funcionando quando o HTMX troca o formulário pela confirmação.
 */
export function initCadernetaDownload() {
  if (inicializado) return;
  inicializado = true;

  document.body.addEventListener("htmx:confirm", aoConfirmar);
  document.body.addEventListener("htmx:afterSwap", aoDepoisDoSwap);
  document.body.addEventListener("htmx:responseError", aoFalhar);
  document.body.addEventListener("htmx:sendError", aoFalhar);
  document.body.addEventListener("htmx:timeout", aoFalhar);
  document.addEventListener("click", aoClicarDownload);
  document.addEventListener("click", aoReiniciar);
}
