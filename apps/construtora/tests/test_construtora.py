"""Testes de regras MCMV, validação de backend, HTMX e cabeçalhos de segurança."""

from decimal import Decimal

from django.core.cache import cache
from django.test import Client
from django.urls import reverse

from apps.construtora.services import calcular_pre_analise_mcmv


def test_calculo_mcmv_faixa_1_decimal() -> None:
    """Garante enquadramento exato na Faixa 1 MCMV usando Decimal."""
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
    """Verifica renderização da home e presença de CSP Nonce e X-Frame-Options."""
    response = client.get(reverse("construtora:home"))
    assert response.status_code == 200
    assert "Content-Security-Policy" in response.headers
    assert "nonce-" in response.headers["Content-Security-Policy"]
    assert response.headers["X-Frame-Options"] == "DENY"


def test_etapa_detalhe_htmx_parcial(client: Client) -> None:
    """Verifica retorno do fragmento parcial HTMX para etapa construtiva válida."""
    url = reverse("construtora:etapa_detalhe", kwargs={"slug": "fundacao-e-alicerce"})
    response = client.get(url, HTTP_HX_REQUEST="true")
    assert response.status_code == 200
    assert b"02" in response.content


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
    assert b"WhatsApp" in response.content

