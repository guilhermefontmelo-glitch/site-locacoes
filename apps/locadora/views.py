"""Views enxutas da área Rocha Locações (SSR + filtros, modal e orçamento via HTMX)."""

import json
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from apps.locadora.forms import FiltroCatalogoForm, OrcamentoLocacaoForm
from apps.locadora.pdf_caderneta import (
    gerar_caderneta,
    gerar_token_caderneta,
    ler_token_caderneta,
)
from apps.locadora.precos import PRECOS
from apps.locadora.selectors import (
    GRUPOS_CATALOGO,
    listar_como_alugar,
    listar_equipamentos,
    obter_equipamento_por_slug,
)
from apps.locadora.services import gerar_resumo_orcamento_locacao
from core.http import add_htmx_vary_headers, htmx_vary_response
from core.security import build_whatsapp_url, validate_anti_bot_submission
from core.throttling import build_rate_limit_response, check_rate_limit


@require_GET
@htmx_vary_response
def catalogo_locadora_view(request: HttpRequest) -> HttpResponse:
    """Renderiza a página da Locadora ou apenas o grid parcial quando acionada via HTMX."""
    filtro_form = FiltroCatalogoForm(data=request.GET)
    if filtro_form.is_valid():
        grupo_ativo: str = filtro_form.cleaned_data["grupo"]
        termo_busca: str = filtro_form.cleaned_data["q"]
    else:
        grupo_ativo = "todos"
        termo_busca = ""

    equipamentos = listar_equipamentos(grupo_slug=grupo_ativo, termo_busca=termo_busca)

    if request.headers.get("HX-Request") == "true":
        return render(
            request,
            "pages/locadora/partials/_grid_equipamentos.html",
            {
                "equipamentos": equipamentos,
                "grupo_ativo": grupo_ativo,
                "termo_busca": termo_busca,
            },
        )

    phone_locadora: str = getattr(settings, "ROCHA_WHATSAPP_LOCADORA", "5588994248183")
    cta_whatsapp_locadora: str = build_whatsapp_url(
        phone_e164=phone_locadora,
        message="Olá! Gostaria de um orçamento de locação de equipamentos para minha obra.",
    )

    context = {
        "active_unit": "locadora",
        "grupos_catalogo": GRUPOS_CATALOGO,
        "grupo_ativo": grupo_ativo,
        "termo_busca": termo_busca,
        "equipamentos": equipamentos,
        "passos_aluguel": listar_como_alugar(),
        "form_orcamento": OrcamentoLocacaoForm(),
        "cta_whatsapp_locadora": cta_whatsapp_locadora,
    }
    return render(request, "pages/locadora/catalogo.html", context)


@require_GET
@htmx_vary_response
def equipamento_modal_htmx_view(request: HttpRequest, slug: str) -> HttpResponse:
    """Hidrata o modal nativo `<dialog>` com especificações técnicas e foto do equipamento."""
    equipamento = obter_equipamento_por_slug(slug=slug)
    if equipamento is None:
        raise Http404("Equipamento não encontrado.")

    return render(
        request,
        "pages/locadora/partials/_modal_equipamento.html",
        {"equipamento": equipamento},
    )


@require_POST
@htmx_vary_response
def solicitar_orcamento_htmx_view(request: HttpRequest) -> HttpResponse:
    """Valida a lista de equipamentos no backend e devolve confirmação com link WhatsApp."""
    rl_decision = check_rate_limit(request, scope="locadora_orcamento")
    if not rl_decision.allowed:
        return build_rate_limit_response(
            request,
            retry_after_seconds=rl_decision.retry_after_seconds,
        )

    anti_bot = validate_anti_bot_submission(request, scope="public_form")
    if not anti_bot.accepted:
        if anti_bot.reason == "honeypot_triggered":
            return add_htmx_vary_headers(HttpResponse(status=204))
        form_retry = OrcamentoLocacaoForm(data=request.POST)
        form_retry.is_valid()
        form_retry.add_error(
            None,
            "Validação temporal de segurança renovada. Confirme o envio do orçamento novamente.",
        )
        return render(
            request,
            "pages/locadora/partials/_form_orcamento.html",
            {"form_orcamento": form_retry},
            status=400,
        )

    form = OrcamentoLocacaoForm(data=request.POST)
    if not form.is_valid():
        return render(
            request,
            "pages/locadora/partials/_form_orcamento.html",
            {"form_orcamento": form},
            status=200,
        )

    cleaned = form.cleaned_data
    resumo = gerar_resumo_orcamento_locacao(
        nome=cleaned["nome"],
        telefone=cleaned["telefone"],
        equipamentos_slugs=list(cleaned["equipamentos"]),
        periodo=cleaned["periodo"],
        modalidade_entrega=cleaned["modalidade_entrega"],
        cidade_obra=cleaned["cidade_obra"],
        bairro_obra=cleaned["bairro_obra"],
        quantidades=cleaned.get("quantidades") or {},
    )

    # Link assinado para o navegador baixar a caderneta automaticamente logo
    # após a confirmação, sem precisar de uma segunda validação do formulário.
    token = gerar_token_caderneta(
        itens=[
            {"nome": item.nome, "qtd": item.quantidade}
            for item in resumo.itens
        ],
        recebedor=resumo.nome_cliente,
        obra=resumo.local_obra_label,
        entrega=resumo.entrega_label,
        periodo=resumo.periodo_label,
        data=timezone.localdate(),
    )
    pdf_url = f"{reverse('locadora:orcamento_pdf')}?{urlencode({'t': token})}"

    return render(
        request,
        "pages/locadora/partials/_resultado_orcamento.html",
        {"resumo": resumo, "pdf_url": pdf_url},
    )


def _ler_pedido_post(request: HttpRequest) -> tuple[dict[str, object] | None, str | None]:
    """Lê o pedido em JSON ou no formato do formulário e devolve dados ou erro."""
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            dados = json.loads(request.body.decode("utf-8") or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None, "Não foi possível ler os dados do pedido."
        if not isinstance(dados, dict):
            return None, "Formato de pedido inválido."

        itens: list[dict[str, object]] = []
        for item in dados.get("itens") or []:
            if isinstance(item, dict):
                nome = str(item.get("nome") or item.get("produto") or "").strip()
                quantidade = item.get("qtd") or item.get("quantidade") or 1
            else:
                nome = str(item).strip()
                quantidade = 1
            if nome in PRECOS:
                itens.append({"nome": nome, "qtd": quantidade})

        periodo = str(dados.get("periodo") or "").strip()
        entrega = str(dados.get("entrega") or "").strip()
        obra = str(dados.get("obra") or "").strip()
        recebedor = str(dados.get("recebedor") or dados.get("nome") or "").strip()

        if not itens:
            return None, "Selecione ao menos um equipamento disponível."
        if not periodo:
            return None, "Informe o período estimado de locação."
        if not entrega:
            return None, "Informe se a entrega será na obra ou retirada na sede."
        return (
            {
                "itens": itens,
                "recebedor": recebedor,
                "obra": obra or "Não informada",
                "entrega": entrega,
                "periodo": periodo,
                "data": dados.get("data") or timezone.localdate(),
            },
            None,
        )

    form = OrcamentoLocacaoForm(data=request.POST)
    if not form.is_valid():
        mensagens = [
            str(erro)
            for erros in form.errors.values()
            for erro in erros
        ]
        return None, mensagens[0] if mensagens else "Confira os dados do pedido."

    cleaned = form.cleaned_data
    resumo = gerar_resumo_orcamento_locacao(
        nome=cleaned["nome"],
        telefone=cleaned["telefone"],
        equipamentos_slugs=list(cleaned["equipamentos"]),
        periodo=cleaned["periodo"],
        modalidade_entrega=cleaned["modalidade_entrega"],
        cidade_obra=cleaned["cidade_obra"],
        bairro_obra=cleaned["bairro_obra"],
        quantidades=cleaned.get("quantidades") or {},
    )
    if not resumo.itens:
        return None, "Selecione ao menos um equipamento disponível."

    return (
        {
            "itens": [
                {"nome": item.nome, "qtd": item.quantidade}
                for item in resumo.itens
            ],
            "recebedor": resumo.nome_cliente,
            "obra": resumo.local_obra_label,
            "entrega": resumo.entrega_label,
            "periodo": resumo.periodo_label,
            "data": timezone.localdate(),
        },
        None,
    )


@require_http_methods(["GET", "POST"])
def orcamento_pdf_view(request: HttpRequest) -> HttpResponse:
    """Baixa a Caderneta de Contas preenchida (GET assinado ou POST do pedido)."""
    if request.method == "GET":
        token = request.GET.get("t", "")
        if not token:
            return JsonResponse(
                {"erro": "Informe o pedido para gerar a caderneta."}, status=400
            )
        try:
            dados = ler_token_caderneta(token)
        except (signing.BadSignature, signing.SignatureExpired):
            return JsonResponse(
                {
                    "erro": (
                        "O link da caderneta expirou. Gere o pedido de orçamento "
                        "novamente para baixar o PDF."
                    )
                },
                status=400,
            )
    else:
        dados, erro = _ler_pedido_post(request)
        if erro or dados is None:
            return JsonResponse({"erro": erro or "Pedido inválido."}, status=400)

    itens = dados.get("itens") or []
    if not itens:
        return JsonResponse(
            {"erro": "Selecione ao menos um equipamento para gerar a caderneta."},
            status=400,
        )

    pdf = gerar_caderneta(
        itens=itens,
        recebedor=str(dados.get("recebedor") or ""),
        obra=str(dados.get("obra") or "Não informada"),
        entrega=str(dados.get("entrega") or ""),
        periodo=str(dados.get("periodo") or ""),
        data=dados.get("data") or timezone.localdate(),
    )

    nome_arquivo = f"Orcamento_Rocha_{timezone.localdate():%d-%m-%Y}.pdf"
    resposta = HttpResponse(pdf, content_type="application/pdf")
    resposta["Content-Disposition"] = f'attachment; filename="{nome_arquivo}"'
    resposta["Cache-Control"] = "no-store"
    return resposta
