"""Views enxutas da Rocha Construtora (SSR + interações Hypermedia via HTMX)."""

import re
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core import signing
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from apps.construtora.forms import (
    EntradaSimplesChoices,
    SimulacaoHabitacionalForm,
    SimulacaoSimplesForm,
    SistemaAmortizacaoChoices,
    TipoCasaSimplesChoices,
)
from apps.construtora.pdf_orcamento import (
    gerar_pdf_simulacao,
    gerar_token_simulacao,
    ler_token_simulacao,
)
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


def _telefone_exibicao(numero: str) -> str:
    """Formata o WhatsApp E.164 (`5588992258807`) para leitura no PDF: `(88) 99225-8807`."""
    digitos = re.sub(r"\D", "", str(numero or ""))
    if len(digitos) == 13 and digitos.startswith("55"):
        ddd, resto = digitos[2:4], digitos[4:]
        if len(resto) == 9:
            return f"({ddd}) {resto[:5]}-{resto[5:]}"
        if len(resto) == 8:
            return f"({ddd}) {resto[:4]}-{resto[4:]}"
    return str(numero or "")


def _pct_renda(parcela: Decimal, renda: Decimal) -> str:
    """Percentual da renda comprometido pela parcela, no padrão brasileiro."""
    if renda <= Decimal("0"):
        return "0,0%"
    percentual = (parcela / renda * Decimal("100")).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )
    return f"{percentual:.1f}%".replace(".", ",")


def _parametros_motor_simples(
    cleaned: dict[str, object],
    *,
    sistema: str,
    prazo_meses: int,
) -> dict[str, object]:
    """Traduz as respostas do modo simples nos parâmetros exatos do motor único."""
    entrada = cleaned["entrada_fgts"]
    return {
        "renda_familiar": cleaned["renda_familiar"],
        "valor_obra": cleaned["valor_obra"],
        "entrada_fgts": entrada,
        "prazo_meses": prazo_meses,
        "sistema_amortizacao": sistema,
        "modalidade": cleaned["modalidade"],
        "possui_fgts": isinstance(entrada, Decimal) and entrada > Decimal("0"),
        "possui_dependentes": True,
        "nome": str(cleaned.get("nome") or ""),
        "telefone": str(cleaned.get("telefone") or ""),
    }


def _montar_contexto_simples(form_simples: SimulacaoSimplesForm) -> dict[str, object]:
    """Calcula SAC, PRICE, alternativas, PDF e WhatsApp a partir do formulário simples."""
    cleaned: dict[str, object] = dict(form_simples.cleaned_data)
    prazo = int(cleaned["prazo"])  # type: ignore[arg-type]

    resultado_sac = simular_financiamento_habitacional(
        **_parametros_motor_simples(
            cleaned, sistema=SistemaAmortizacaoChoices.SAC, prazo_meses=prazo
        )
    )
    resultado_price = simular_financiamento_habitacional(
        **_parametros_motor_simples(
            cleaned, sistema=SistemaAmortizacaoChoices.PRICE, prazo_meses=prazo
        )
    )
    alternativa_prazo_longo = simular_financiamento_habitacional(
        **_parametros_motor_simples(
            cleaned, sistema=SistemaAmortizacaoChoices.SAC, prazo_meses=420
        )
    )
    alternativa_prazo_curto = simular_financiamento_habitacional(
        **_parametros_motor_simples(
            cleaned, sistema=SistemaAmortizacaoChoices.SAC, prazo_meses=240
        )
    )

    comprometimento_sac = _pct_renda(
        resultado_sac.primeira_parcela, resultado_sac.renda_familiar
    )
    comprometimento_price = _pct_renda(
        resultado_price.primeira_parcela, resultado_price.renda_familiar
    )

    payload_pdf = {
        "nome": resultado_sac.nome_cliente,
        "data": timezone.localdate(),
        "faixa": resultado_sac.faixa_titulo,
        "modalidade": resultado_sac.modalidade_label,
        "renda": resultado_sac.renda_familiar_formatada,
        "valor_obra": resultado_sac.valor_obra_formatado,
        "entrada": resultado_sac.entrada_informada_formatada,
        "subsidio": resultado_sac.subsidio_estimado_formatado,
        "financiado": resultado_sac.valor_financiado_formatado,
        "prazo": f"{resultado_sac.prazo_meses} meses",
        "ltv": f"{resultado_sac.ltv_percentual}%",
        "entrada_minima": resultado_sac.entrada_minima_formatada,
        "primeira_sac": resultado_sac.primeira_parcela_formatada,
        "ultima_sac": resultado_sac.ultima_parcela_formatada,
        "total_pago_sac": resultado_sac.total_pago_estimado_formatado,
        "primeira_price": resultado_price.primeira_parcela_formatada,
        "ultima_price": resultado_price.ultima_parcela_formatada,
        "total_pago_price": resultado_price.total_pago_estimado_formatado,
        "comprometimento_sac": comprometimento_sac,
        "comprometimento_price": comprometimento_price,
        "orientacao": resultado_sac.orientacao_tecnica,
        "whatsapp": _telefone_exibicao(
            getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")
        ),
    }
    token_pdf = gerar_token_simulacao(payload_pdf)

    tipo = str(cleaned.get("tipo_casa") or "")
    entrada_faixa = str(cleaned.get("entrada_faixa") or "")
    rotulo_casa = dict(TipoCasaSimplesChoices.CHOICES).get(tipo, "Projeto personalizado")
    rotulo_entrada = dict(EntradaSimplesChoices.CHOICES).get(entrada_faixa, "")

    return {
        "form_simples": form_simples,
        "resultado_sac": resultado_sac,
        "resultado_price": resultado_price,
        "comprometimento_sac": comprometimento_sac,
        "comprometimento_price": comprometimento_price,
        "rotulo_casa": rotulo_casa,
        "rotulo_entrada": rotulo_entrada,
        "whatsapp_simples_url": resultado_sac.whatsapp_url,
        "pdf_simples_url": reverse(
            "construtora:simulacao_simples_pdf", kwargs={"token": token_pdf}
        ),
        "alternativas": [
            {
                "titulo": "Parcela menor",
                "descricao": "Esticando o prazo para 420 meses.",
                "resultado": alternativa_prazo_longo,
            },
            {
                "titulo": "Quitar mais rápido",
                "descricao": "Reduzindo o prazo para 240 meses.",
                "resultado": alternativa_prazo_curto,
            },
        ],
        "valores_avancado": {
            "modalidade": str(cleaned["modalidade"]),
            "renda_familiar": f"{cleaned['renda_familiar']:.2f}",
            "valor_obra": f"{cleaned['valor_obra']:.2f}",
            "entrada_fgts": f"{cleaned['entrada_fgts']:.2f}",
            "prazo_meses": str(prazo),
        },
    }


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
        "form_simples": SimulacaoSimplesForm(),
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
        "form_simples": SimulacaoSimplesForm(),
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


@require_http_methods(["GET", "POST"])
def simular_financiamento_simples_view(request: HttpRequest) -> HttpResponse:
    """Modo simples em 6 perguntas: calcula SAC/PRICE no mesmo motor financeiro do modo avançado."""
    if request.method == "GET":
        return render(
            request,
            "pages/construtora/partials/_simulador_simples.html",
            {"form_simples": SimulacaoSimplesForm()},
        )

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
        form_retry = SimulacaoSimplesForm(data=request.POST)
        form_retry.is_valid()
        form_retry.add_error(
            None,
            "Validação temporal de segurança renovada. Clique novamente para confirmar o cálculo.",
        )
        return render(
            request,
            "pages/construtora/partials/_simulador_simples.html",
            {"form_simples": form_retry},
            status=400,
        )

    form = SimulacaoSimplesForm(data=request.POST)
    if not form.is_valid():
        return render(
            request,
            "pages/construtora/partials/_simulador_simples.html",
            {"form_simples": form},
        )

    contexto = _montar_contexto_simples(form)
    return render(
        request,
        "pages/construtora/partials/_resultado_simples.html",
        contexto,
    )


@require_GET
def simulacao_simples_pdf_view(request: HttpRequest, token: str) -> HttpResponse:
    """Entrega o resumo em PDF do modo simples a partir de um token assinado e efêmero."""
    try:
        dados = ler_token_simulacao(token)
    except (signing.BadSignature, signing.SignatureExpired) as exc:
        raise Http404("Simulação não encontrada ou expirada.") from exc

    pdf_bytes = gerar_pdf_simulacao(dados)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = (
        'attachment; filename="simulacao-habitacional-rocha.pdf"'
    )
    response["Cache-Control"] = "private, no-store"
    return response
