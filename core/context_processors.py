"""Context processors globais para metadados institucionais da Rocha Construtora & Locações."""

from typing import Any

from django.conf import settings
from django.http import HttpRequest

from core.security import generate_form_timestamp_token


def site_context(request: HttpRequest) -> dict[str, Any]:
    """Disponibiliza o `csp_nonce` da requisição e os dados canônicos da marca nos templates."""
    whatsapp_construtora: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")
    whatsapp_locadora: str = getattr(settings, "ROCHA_WHATSAPP_LOCADORA", "5588994248183")

    return {
        "csp_nonce": getattr(request, "csp_nonce", ""),
        "form_ts_token": generate_form_timestamp_token(scope="public_form"),
        "rocha": {
            "nome_marca": "Rocha Construtora",
            "nome_construtora": "Rocha Construtora",
            "nome_locadora": "Rocha Locações",
            "logo_construtora_dark": "img/brand/logo-construtora-dark.png",
            "logo_construtora_light": "img/brand/logo-construtora-light.png",
            "logo_locadora_dark": "img/brand/logo-locacoes-dark.png",
            "logo_locadora_light": "img/brand/logo-locacoes-light.png",
            "slogan_construtora": "Obras financiadas Caixa Habitacional & Minha Casa Minha Vida",
            "slogan_locadora": "Locação de equipamentos para construção civil",
            "cidade_uf": "Viçosa do Ceará - CE",
            "endereco_linha_1": "Rua Vereador Luiz Carlos de Sampaio, 366",
            "endereco_linha_2": "Loteamento Conviver I, Santa Bárbara",
            "cep": "62300-000",
            "whatsapp_construtora": whatsapp_construtora,
            "whatsapp_locadora": whatsapp_locadora,
            "tel_construtora_display": "(88) 99225-8807",
            "tel_locadora_display": "(88) 99424-8183",
            "instagram_construtora": "https://www.instagram.com/rocha.construtoraa_/",
            "instagram_locadora": "https://www.instagram.com/rocha.locacoes_/",
            "maps_url": (
                "https://www.google.com/maps/search/?api=1&query="
                "Rua+Vereador+Luiz+Carlos+de+Sampaio+366+Vi%C3%A7osa+do+Cear%C3%A1+CE"
            ),
            "url_construtora": "/",
            "url_locadora": "/locadora/",
        },
    }
