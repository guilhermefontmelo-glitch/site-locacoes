"""Views enxutas da Rocha Construtora (SSR + interações Hypermedia via HTMX)."""

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from apps.construtora.forms import SimulacaoMCMVForm
from apps.construtora.selectors import (
    listar_etapas_obra,
    listar_passos_financiamento,
    listar_projetos_referencia,
    obter_etapa_por_slug,
)
from apps.construtora.services import calcular_pre_analise_mcmv
from core.security import build_whatsapp_url, is_honeypot_triggered
from core.throttling import is_rate_limited


@require_GET
def home_construtora_view(request: HttpRequest) -> HttpResponse:
    """Renderiza a Landing Page principal da Rocha Construtora (3D + Etapas + Caixa/MCMV)."""
    etapas = listar_etapas_obra()
    phone_construtora: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")

    cta_whatsapp_geral: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message=(
            "Olá! Vim pelo site da Rocha Construtora e gostaria de saber como construir "
            "minha casa financiada pela Caixa / Minha Casa Minha Vida."
        ),
    )
    whatsapp_etapa_inicial: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message=(
            f"Olá! Estava vendo a etapa '{etapas[0].codigo} - {etapas[0].titulo}' no site "
            "da Rocha Construtora e gostaria de conversar com a engenharia."
        ),
    )

    context = {
        "active_unit": "construtora",
        "etapas_obra": etapas,
        "etapa_ativa": etapas[0],
        "whatsapp_etapa_inicial": whatsapp_etapa_inicial,
        "passos_financiamento": listar_passos_financiamento(),
        "projetos_referencia": listar_projetos_referencia(),
        "form_simulacao": SimulacaoMCMVForm(),
        "cta_whatsapp_geral": cta_whatsapp_geral,
    }
    return render(request, "pages/construtora/home.html", context)


@require_GET
def etapa_detalhe_htmx_view(request: HttpRequest, slug: str) -> HttpResponse:
    """Retorna o painel técnico de uma etapa da obra via HTMX para inspeção interativa."""
    etapa = obter_etapa_por_slug(slug=slug)
    if etapa is None:
        raise Http404("Etapa construtiva não encontrada.")

    phone_construtora: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")
    whatsapp_etapa_url: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message=(
            f"Olá! Estava vendo a etapa '{etapa.codigo} - {etapa.titulo}' no site da "
            "Rocha Construtora e gostaria de tirar uma dúvida com a engenharia."
        ),
    )

    return render(
        request,
        "pages/construtora/partials/_etapa_painel.html",
        {
            "etapa_ativa": etapa,
            "whatsapp_etapa_url": whatsapp_etapa_url,
        },
    )


@require_POST
def simular_financiamento_view(request: HttpRequest) -> HttpResponse:
    """Processa e valida a pré-simulação MCMV no backend, retornando parcial HTMX."""
    if is_rate_limited(request, scope="construtora_simulador"):
        return render(request, "errors/429.html", status=429)

    # Descarte silencioso caso preenchido por bot automatizado
    if is_honeypot_triggered(request):
        return HttpResponse(status=204)

    form = SimulacaoMCMVForm(data=request.POST)
    if not form.is_valid():
        return render(
            request,
            "pages/construtora/partials/_form_simulacao.html",
            {"form_simulacao": form},
            status=200,
        )

    cleaned = form.cleaned_data
    resultado = calcular_pre_analise_mcmv(
        nome=cleaned["nome"],
        telefone=cleaned["telefone"],
        renda_familiar=cleaned["renda_familiar"],
        modalidade=cleaned["modalidade"],
        possui_fgts=cleaned["possui_fgts"] == "sim",
        cidade_obra=cleaned["cidade_obra"],
    )

    return render(
        request,
        "pages/construtora/partials/_resultado_simulacao.html",
        {"resultado": resultado},
    )
