"""Views enxutas da Rocha Construtora (SSR + interações Hypermedia via HTMX)."""

from decimal import Decimal

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from apps.construtora.forms import SimulacaoHabitacionalForm
from apps.construtora.selectors import (
    EtapaConstrutiva,
    listar_etapas_obra,
    listar_passos_financiamento,
    listar_projetos_referencia,
    obter_etapa_por_ordem,
    obter_etapa_por_slug,
    serializar_etapas_obra_payload,
)
from apps.construtora.services import (
    ResultadoSimulacaoHabitacional,
    simular_financiamento_habitacional,
)
from core.http import add_htmx_vary_headers, htmx_vary_response
from core.security import build_whatsapp_url, validate_anti_bot_submission
from core.throttling import build_rate_limit_response, check_rate_limit


def _build_default_simulacao() -> ResultadoSimulacaoHabitacional:
    """Gera o resultado inicial pré-calculado exibido imediatamente no SSR do simulador."""
    return simular_financiamento_habitacional(
        renda_familiar=Decimal("3500.00"),
        valor_obra=Decimal("220000.00"),
        entrada_fgts=Decimal("25000.00"),
        prazo_meses=360,
        sistema_amortizacao="SAC",
        modalidade="terreno_construcao",
        possui_fgts=True,
        possui_dependentes=True,
        cidade_obra="Viçosa do Ceará - CE",
    )


def _render_etapa_response(request: HttpRequest, etapa: EtapaConstrutiva) -> HttpResponse:
    """Renderiza o painel técnico da etapa construtiva (HTMX parcial ou acesso direto)."""
    phone_construtora: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")
    whatsapp_etapa_url: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message=(
            f"Olá! Estava vendo a etapa '{etapa.codigo} - {etapa.titulo}' no site da "
            "Rocha Construtora e gostaria de tirar uma dúvida com a engenharia."
        ),
    )

    if request.headers.get("HX-Request") == "true":
        return render(
            request,
            "pages/construtora/partials/_etapa_painel.html",
            {
                "etapa_ativa": etapa,
                "whatsapp_etapa_url": whatsapp_etapa_url,
            },
        )

    etapas = listar_etapas_obra()
    cta_whatsapp_geral: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message=(
            "Olá! Vim pelo site da Rocha Construtora e gostaria de saber como construir "
            "minha casa financiada pela Caixa / Minha Casa Minha Vida."
        ),
    )
    context = {
        "active_unit": "construtora",
        "etapas_obra": etapas,
        "etapa_ativa": etapa,
        "etapas_obra_payload": serializar_etapas_obra_payload(phone_e164=phone_construtora),
        "whatsapp_etapa_inicial": whatsapp_etapa_url,
        "passos_financiamento": listar_passos_financiamento(),
        "projetos_referencia": listar_projetos_referencia(),
        "form_simulacao": SimulacaoHabitacionalForm(),
        "resultado_simulacao": _build_default_simulacao(),
        "cta_whatsapp_geral": cta_whatsapp_geral,
    }
    return render(request, "pages/construtora/home.html", context)


@require_GET
@htmx_vary_response
def home_construtora_view(request: HttpRequest) -> HttpResponse:
    """Renderiza a Landing Page principal da Rocha Construtora (3D + Etapas + Simulador)."""
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
        "etapas_obra_payload": serializar_etapas_obra_payload(phone_e164=phone_construtora),
        "whatsapp_etapa_inicial": whatsapp_etapa_inicial,
        "passos_financiamento": listar_passos_financiamento(),
        "projetos_referencia": listar_projetos_referencia(),
        "form_simulacao": SimulacaoHabitacionalForm(),
        "resultado_simulacao": _build_default_simulacao(),
        "cta_whatsapp_geral": cta_whatsapp_geral,
    }
    return render(request, "pages/construtora/home.html", context)


@require_GET
@htmx_vary_response
def etapa_detalhe_numero_htmx_view(request: HttpRequest, ordem: int) -> HttpResponse:
    """Retorna a etapa construtiva pelo índice numérico `/etapas/<int:ordem>/` (`1..6`)."""
    etapa = obter_etapa_por_ordem(ordem=ordem)
    if etapa is None:
        raise Http404("Etapa construtiva não encontrada.")
    return _render_etapa_response(request, etapa)


@require_GET
@htmx_vary_response
def etapa_detalhe_htmx_view(request: HttpRequest, slug: str) -> HttpResponse:
    """Retorna o painel técnico de uma etapa da obra pelo slug `/etapas/<slug:slug>/`."""
    etapa = obter_etapa_por_slug(slug=slug)
    if etapa is None:
        raise Http404("Etapa construtiva não encontrada.")
    return _render_etapa_response(request, etapa)


@require_POST
@htmx_vary_response
def simular_financiamento_view(request: HttpRequest) -> HttpResponse:
    """Processa e valida a simulação `SAC`/`PRICE` em `Decimal`, mantendo o workspace visível."""
    rl_decision = check_rate_limit(request, scope="construtora_simulador")
    if not rl_decision.allowed:
        return build_rate_limit_response(
            request,
            retry_after_seconds=rl_decision.retry_after_seconds,
        )

    anti_bot = validate_anti_bot_submission(request, scope="public_form")
    if not anti_bot.accepted:
        if anti_bot.reason == "honeypot_triggered":
            return add_htmx_vary_headers(HttpResponse(status=204))
        form_retry = SimulacaoHabitacionalForm(data=request.POST)
        form_retry.is_valid()
        form_retry.add_error(
            None,
            "Validação temporal de segurança renovada. Clique novamente para confirmar o cálculo.",
        )
        return render(
            request,
            "pages/construtora/partials/_simulador_workspace.html",
            {
                "form_simulacao": form_retry,
                "resultado_simulacao": _build_default_simulacao(),
            },
            status=400,
        )

    form = SimulacaoHabitacionalForm(data=request.POST)
    if not form.is_valid():
        return render(
            request,
            "pages/construtora/partials/_simulador_workspace.html",
            {
                "form_simulacao": form,
                "resultado_simulacao": _build_default_simulacao(),
            },
            status=200,
        )

    cleaned = form.cleaned_data
    resultado = simular_financiamento_habitacional(
        renda_familiar=cleaned["renda_familiar"],
        valor_obra=cleaned["valor_obra"],
        entrada_fgts=cleaned["entrada_fgts"],
        prazo_meses=cleaned["prazo_meses"],
        sistema_amortizacao=cleaned["sistema_amortizacao"],
        modalidade=cleaned["modalidade"],
        possui_fgts=cleaned["possui_fgts"] == "sim",
        possui_dependentes=cleaned["possui_dependentes"] == "sim",
        nome=cleaned["nome"],
        telefone=cleaned["telefone"],
        cidade_obra=cleaned["cidade_obra"],
    )

    return render(
        request,
        "pages/construtora/partials/_simulador_workspace.html",
        {
            "form_simulacao": form,
            "resultado_simulacao": resultado,
            "simulacao_atualizada": True,
        },
    )
