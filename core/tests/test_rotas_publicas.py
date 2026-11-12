"""Testes das rotas públicas após a migração da Locadora para a raiz (`/`)."""

from django.test import Client
from django.urls import reverse


def test_locadora_abre_na_raiz(client: Client) -> None:
    """A home `/` passa a renderizar o catálogo da Rocha Locações."""
    response = client.get("/")

    assert response.status_code == 200
    assert reverse("locadora:catalogo") == "/"
    html = response.content.decode("utf-8")
    assert 'data-unit="locadora"' in html
    assert "Rocha Locações" in html


def test_construtora_abre_em_construtora(client: Client) -> None:
    """A vertical Construtora passa a viver sob `/construtora/`."""
    response = client.get("/construtora/")

    assert response.status_code == 200
    assert reverse("construtora:home") == "/construtora/"
    assert 'data-unit="construtora"' in response.content.decode("utf-8")


def test_locadora_legado_redireciona_301_para_raiz(client: Client) -> None:
    """`/locadora/` responde 301 permanente apontando para `/`."""
    response = client.get("/locadora/")

    assert response.status_code == 301
    assert response.headers["Location"] == "/"


def test_locadora_legado_preserva_subrota_e_query_string(client: Client) -> None:
    """Subrotas e tokens antigos são reaproveitados sob a nova raiz."""
    response = client.get("/locadora/orcamento/pdf/?t=abc123")

    assert response.status_code == 301
    assert response.headers["Location"] == "/orcamento/pdf/?t=abc123"


def test_switcher_aponta_para_as_novas_rotas(client: Client) -> None:
    """Os links de alternância entre verticais usam `/` e `/construtora/`."""
    html_locadora = client.get("/").content.decode("utf-8")
    html_construtora = client.get("/construtora/").content.decode("utf-8")

    assert 'href="/construtora/"' in html_locadora
    assert 'href="/"' in html_construtora
