"""Testes de catálogo, filtragem HTMX, modal técnico `<picture>` e orçamento da Rocha Locações."""

from django.core.cache import cache
from django.test import Client
from django.urls import reverse

from apps.locadora.selectors import listar_equipamentos


def test_filtro_equipamentos_por_grupo() -> None:
    """Retorna apenas os equipamentos da família solicitada."""
    itens = listar_equipamentos(grupo_slug="concretagem")
    assert len(itens) == 2
    assert all(item.grupo_slug == "concretagem" for item in itens)


def test_catalogo_locadora_ssr_e_parcial_htmx(client: Client) -> None:
    """Valida renderização completa SSR, isolamento JS/CSS, imagens AVIF/WebP e resposta HTMX."""
    url = reverse("locadora:catalogo")
    full_resp = client.get(url)
    assert full_resp.status_code == 200
    assert "HX-Request" in full_resp.headers["Vary"]

    html = full_resp.content.decode("utf-8")
    assert "<!DOCTYPE html>" in html
    assert "Rocha Locações | Locação de Equipamentos" in html
    assert "logo-locacoes-dark.png" in html
    assert "logo-locacoes-light.png" in html
    assert "unit-switcher__bubble" in html
    assert "mobile-unit-bar" in html
    assert "hero-operacao-canteiro.avif" in html
    assert "andaime-tubular.avif" in html
    assert "betoneira-400l.avif" in html
    assert "unsplash.com" not in html
    assert 'src="/static/js/modules/scene3d-obra.js"' not in html
    assert 'style="' not in html
    assert "MCMV" not in html

    htmx_resp = client.get(f"{url}?grupo=estruturas", HTTP_HX_REQUEST="true")
    assert htmx_resp.status_code == 200
    assert "HX-Request" in htmx_resp.headers["Vary"]
    htmx_html = htmx_resp.content.decode("utf-8")
    assert "<!DOCTYPE html>" not in htmx_html
    assert "Andaimes" in htmx_html
    assert 'style="' not in htmx_html
    assert "MCMV" not in htmx_html


def test_detalhe_equipamento_modal_renderiza_picture_local(client: Client) -> None:
    """Verifica que o modal técnico de equipamento renderiza `<picture>` AVIF/WebP local."""
    url = reverse("locadora:equipamento_modal", kwargs={"slug": "betoneira-400l"})
    resp = client.get(url, HTTP_HX_REQUEST="true")
    assert resp.status_code == 200
    assert "HX-Request" in resp.headers["Vary"]

    html = resp.content.decode("utf-8")
    assert "<picture" in html
    assert "betoneira-400l.avif" in html
    assert "betoneira-400l.webp" in html
    assert 'style="' not in html
    assert "MCMV" not in html


def test_orcamento_locadora_valido_gera_whatsapp(client: Client) -> None:
    """Valida submissão multi-equipamento e geração de URL sanitizada do WhatsApp."""
    cache.clear()
    response = client.post(
        reverse("locadora:solicitar_orcamento"),
        data={
            "nome": "Mestre Antonio",
            "telefone": "(88) 99424-8183",
            "equipamentos": ["andaimes-tubulares", "betoneira-400l"],
            "periodo": "quinzenal",
            "modalidade_entrega": "entrega_obra",
            "observacoes": "Centro de Viçosa",
        },
    )
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "https://wa.me/" in html
    assert "MCMV" not in html
