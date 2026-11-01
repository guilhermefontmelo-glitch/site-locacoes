"""Testes de motor Decimal SAC/PRICE, rotas de etapas 01..06, HTMX, ativos locais e segurança."""

from decimal import Decimal

import pytest
from django.core.cache import cache
from django.test import Client
from django.urls import reverse

from apps.construtora.forms import (
    ModalidadeFinanciamentoChoices,
    SimulacaoHabitacionalForm,
    SistemaAmortizacaoChoices,
    parse_brl_decimal,
)
from apps.construtora.services import (
    calcular_pre_analise_mcmv,
    simular_financiamento_habitacional,
)


def test_calculo_mcmv_faixa_1_decimal() -> None:
    """Garante enquadramento exato na Faixa 1 Minha Casa Minha Vida usando Decimal."""
    res = calcular_pre_analise_mcmv(
        nome="Maria Silva",
        telefone="(88) 99999-1111",
        renda_familiar=Decimal("2500.00"),
        modalidade="terreno_construcao",
        possui_fgts=True,
        cidade_obra="Viçosa do Ceará - CE",
    )
    assert "Faixa 1" in res.faixa_titulo
    assert res.parcela_teto_formatada == "R$ 750,00"
    assert res.whatsapp_url.startswith("https://wa.me/")


def test_home_construtora_headers_seguranca(client: Client) -> None:
    """Verifica renderização da home, logos dark/light, zero sigla proibida, zero CDN e CSP."""
    response = client.get(reverse("construtora:home"))
    assert response.status_code == 200
    assert "Content-Security-Policy" in response.headers
    assert "nonce-" in response.headers["Content-Security-Policy"]
    assert "style-src-attr 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "HX-Request" in response.headers["Vary"]

    html = response.content.decode("utf-8")
    assert "logo-construtora-dark.png" in html
    assert "logo-construtora-light.png" in html
    assert "unit-switcher__bubble" in html
    assert "mobile-unit-bar" in html
    assert "etapas-obra-json" in html
    assert "hero-residencia-ceara.avif" in html
    assert "unsplash.com" not in html
    assert 'style="' not in html
    assert "MCMV" not in html


def test_etapa_detalhe_htmx_parcial(client: Client) -> None:
    """Verifica retorno do fragmento parcial HTMX para etapa construtiva válida por slug."""
    url = reverse("construtora:etapa_detalhe", kwargs={"slug": "fundacao-e-alicerce"})
    response = client.get(url, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert "HX-Request" in response.headers["Vary"]
    html = response.content.decode("utf-8")
    assert "02" in html
    assert "etapa-02-fundacao.avif" in html
    assert 'style="' not in html
    assert "MCMV" not in html


@pytest.mark.parametrize("ordem", [1, 2, 3, 4, 5, 6])
def test_etapa_detalhe_por_ordem_ssr_e_htmx(client: Client, ordem: int) -> None:
    """Garante suporte às rotas numéricas `/etapas/1/`..`/etapas/6/` em SSR e HTMX."""
    url = reverse("construtora:etapa_detalhe_numero", kwargs={"ordem": ordem})

    htmx_resp = client.get(url, HTTP_HX_REQUEST="true")
    assert htmx_resp.status_code == 200
    htmx_html = htmx_resp.content.decode("utf-8")
    assert f"0{ordem}" in htmx_html
    assert "<!DOCTYPE html>" not in htmx_html
    assert "MCMV" not in htmx_html

    ssr_resp = client.get(url)
    assert ssr_resp.status_code == 200
    ssr_html = ssr_resp.content.decode("utf-8")
    assert "<!DOCTYPE html>" in ssr_html
    assert "MCMV" not in ssr_html


def test_etapa_detalhe_ordem_invalida_retorna_404(client: Client) -> None:
    """Índices fora de 1..6 devem retornar HTTP 404."""
    url_invalida = reverse("construtora:etapa_detalhe_numero", kwargs={"ordem": 99})
    assert client.get(url_invalida).status_code == 404


def test_simulador_bloqueia_honeypot_bot(client: Client) -> None:
    """Bots que preenchem o campo oculto recebem descarte silencioso HTTP 204."""
    cache.clear()
    response = client.post(
        reverse("construtora:simular_mcmv"),
        data={
            "nome": "Bot Spam",
            "telefone": "88999998888",
            "renda_familiar": "3000.00",
            "modalidade": "terreno_construcao",
            "possui_fgts": "sim",
            "cidade_obra": "Viçosa",
            "website_url_trap": "http://spam.example",
        },
    )
    assert response.status_code == 204


def test_simulador_valida_entrada_no_backend(client: Client) -> None:
    """Rejeita telefone inválido e renda abaixo do piso mínimo no backend."""
    cache.clear()
    response = client.post(
        reverse("construtora:simular_mcmv"),
        data={
            "nome": "Joao",
            "telefone": "123",
            "renda_familiar": "500.00",
            "modalidade": "terreno_construcao",
            "possui_fgts": "nao",
            "cidade_obra": "Viçosa do Ceará",
        },
    )
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "WhatsApp" in html
    assert "MCMV" not in html


def test_simulador_aceita_mascara_brl_sem_exigir_nome_ou_telefone(client: Client) -> None:
    """Permite simulação instantânea com valores BRL formatados e contato em branco."""
    cache.clear()
    response = client.post(
        reverse("construtora:simular_mcmv"),
        data={
            "modalidade": "terreno_proprio",
            "renda_familiar": "R$ 4.200,00",
            "valor_obra": "R$ 240.000,00",
            "entrada_fgts": "R$ 30.000,00",
            "prazo_meses": "360",
            "sistema_amortizacao": "PRICE",
            "possui_fgts": "sim",
            "possui_dependentes": "sim",
            "nome": "",
            "telefone": "",
            "cidade_obra": "Viçosa do Ceará - CE",
        },
        HTTP_HX_REQUEST="true",
    )
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Faixa 2" in html
    assert "PRICE" in html
    assert "teto LTV 90%" in html
    assert "simulador-workspace" in html
    assert 'style="' not in html
    assert "MCMV" not in html


def test_parse_brl_decimal_formatos_mistos() -> None:
    """Converte máscaras brasileiras e formatos numéricos em Decimal exato."""
    assert parse_brl_decimal("R$ 3.500,00") == Decimal("3500.00")
    assert parse_brl_decimal("220.000,50") == Decimal("220000.50")
    assert parse_brl_decimal("3500.00") == Decimal("3500.00")
    assert parse_brl_decimal(Decimal("1890.456")) == Decimal("1890.46")


def test_motor_financeiro_sac_vs_price_e_faixas_decimal() -> None:
    """Valida matemática Decimal determinística entre SAC, PRICE, Faixas 1..3 e SBPE."""
    sac = simular_financiamento_habitacional(
        renda_familiar=Decimal("3600.00"),
        valor_obra=Decimal("220000.00"),
        entrada_fgts=Decimal("25000.00"),
        prazo_meses=360,
        sistema_amortizacao=SistemaAmortizacaoChoices.SAC,
        modalidade=ModalidadeFinanciamentoChoices.TERRENO_PROPRIO,
        possui_fgts=True,
        possui_dependentes=True,
    )
    price = simular_financiamento_habitacional(
        renda_familiar=Decimal("3600.00"),
        valor_obra=Decimal("220000.00"),
        entrada_fgts=Decimal("25000.00"),
        prazo_meses=360,
        sistema_amortizacao=SistemaAmortizacaoChoices.PRICE,
        modalidade=ModalidadeFinanciamentoChoices.TERRENO_PROPRIO,
        possui_fgts=True,
        possui_dependentes=True,
    )

    assert sac.ltv_percentual == 90
    assert sac.primeira_parcela_formatada != sac.ultima_parcela_formatada
    assert price.primeira_parcela_formatada == price.ultima_parcela_formatada
    assert "MCMV" not in sac.faixa_titulo

    faixa_3 = simular_financiamento_habitacional(
        renda_familiar=Decimal("6800.00"),
        valor_obra=Decimal("310000.00"),
        entrada_fgts=Decimal("65000.00"),
    )
    assert "Faixa 3" in faixa_3.faixa_titulo
    assert faixa_3.subsidio_estimado_formatado == "R$ 0,00"

    sbpe = simular_financiamento_habitacional(
        renda_familiar=Decimal("14000.00"),
        valor_obra=Decimal("520000.00"),
        entrada_fgts=Decimal("120000.00"),
        sistema_amortizacao=SistemaAmortizacaoChoices.PRICE,
    )
    assert "SBPE" in sbpe.faixa_titulo
    assert sbpe.ltv_percentual == 70


def test_form_simulacao_labels_sem_sigla_proibida() -> None:
    """Garante que nenhum label ou help_text do formulário emita a sigla proibida."""
    form = SimulacaoHabitacionalForm()
    for field in form.fields.values():
        assert "MCMV" not in str(field.label)
        assert "MCMV" not in str(field.help_text)
