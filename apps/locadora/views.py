"""Views enxutas da área Rocha Locações (SSR + filtros, modal e orçamento via HTMX)."""

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from apps.locadora.forms import FiltroCatalogoForm, OrcamentoLocacaoForm
from apps.locadora.selectors import (
    GRUPOS_CATALOGO,
    listar_como_alugar,
    listar_equipamentos,
    obter_equipamento_por_slug,
)
from apps.locadora.services import gerar_resumo_orcamento_locacao
from core.security import build_whatsapp_url, is_honeypot_triggered
from core.throttling import is_rate_limited


@require_GET
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

    # Resposta parcial ultrarrápida para filtragem HTMX sem recarregar a página
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
def equipamento_modal_htmx_view(request: HttpRequest, slug: str) -> HttpResponse:
    """Hidrata o modal nativo `<dialog>` com especificações técnicas do equipamento."""
    equipamento = obter_equipamento_por_slug(slug=slug)
    if equipamento is None:
        raise Http404("Equipamento não encontrado.")

    return render(
        request,
        "pages/locadora/partials/_modal_equipamento.html",
        {"equipamento": equipamento},
    )


@require_POST
def solicitar_orcamento_htmx_view(request: HttpRequest) -> HttpResponse:
    """Valida a lista de equipamentos no backend e devolve confirmação com link WhatsApp."""
    if is_rate_limited(request, scope="locadora_orcamento"):
        return render(request, "errors/429.html", status=429)

    if is_honeypot_triggered(request):
        return HttpResponse(status=204)

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
        observacoes=cleaned["observacoes"],
    )

    return render(
        request,
        "pages/locadora/partials/_resultado_orcamento.html",
        {"resumo": resumo},
    )

