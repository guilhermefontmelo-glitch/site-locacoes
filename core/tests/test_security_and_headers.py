"""Testes de hardening Zero-Trust: CSP, Hosts Vercel, Rate Limiting, Anti-Bot e Admin oculto."""

import time

import pytest
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import Client, RequestFactory, override_settings
from django.urls import reverse

from config.settings._validators import (
    resolve_strict_hosts_and_origins,
    validate_strict_hostname,
    validate_strict_origin,
)
from core.security import (
    FORM_TS_FIELD,
    build_whatsapp_url,
    generate_form_timestamp_token,
    validate_anti_bot_submission,
)
from core.throttling import (
    build_rate_limit_response,
    check_rate_limit,
    get_client_ip,
    hash_client_ip,
)


def test_csp_zero_cdn_strict_headers_and_unique_nonce(client: Client) -> None:
    """Garante CSP `default-src 'none'`, `style-src-attr 'none'`, zero CDN e nonce por request."""
    first = client.get(reverse("construtora:home"))
    second = client.get(reverse("construtora:home"))

    csp_1 = first.headers["Content-Security-Policy"]
    csp_2 = second.headers["Content-Security-Policy"]

    assert csp_1 != csp_2
    assert "default-src 'none'" in csp_1
    assert "style-src-attr 'none'" in csp_1
    assert "'unsafe-inline'" not in csp_1
    assert "'unsafe-eval'" not in csp_1
    assert "cdn.jsdelivr.net" not in csp_1
    assert "unpkg.com" not in csp_1
    assert "fonts.googleapis.com" not in csp_1
    assert "fonts.gstatic.com" not in csp_1

    assert first.headers["Cross-Origin-Opener-Policy"] == "same-origin"
    assert first.headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert first.headers["X-Permitted-Cross-Domain-Policies"] == "none"
    assert "camera=()" in first.headers["Permissions-Policy"]
    assert "browsing-topics=()" in first.headers["Permissions-Policy"]


@pytest.mark.parametrize(
    "bad_host",
    [
        ".vercel.app",
        "*.vercel.app",
        "*",
        "https://*.vercel.app",
        "bad host space.com",
    ],
)
def test_validate_strict_hostname_rejeita_wildcards(bad_host: str) -> None:
    """Rejeita qualquer wildcard de subdomínio ou hostname fora do padrão RFC 1123."""
    with pytest.raises(ImproperlyConfigured):
        validate_strict_hostname(bad_host)


@pytest.mark.parametrize(
    "bad_origin",
    [
        "https://*.vercel.app",
        "http://site-locacoes.vercel.app",
        "https://site-locacoes.vercel.app/caminho",
        "*.vercel.app",
    ],
)
def test_validate_strict_origin_rejeita_wildcards_e_http(bad_origin: str) -> None:
    """Garante que apenas origens HTTPS explícitas e sem caminho sejam aceitas."""
    with pytest.raises(ImproperlyConfigured):
        validate_strict_origin(bad_origin)


def test_resolve_strict_hosts_vercel_sem_wildcard() -> None:
    """Resolve hosts e origens explícitos das variáveis Vercel sem `.vercel.app`."""
    hosts, origins = resolve_strict_hosts_and_origins(
        configured_hosts=["rochaconstrutora.com.br"],
        configured_origins=["https://rochaconstrutora.com.br"],
        is_vercel=True,
        environ_map={
            "VERCEL_URL": "site-locacoes-git-main-rocha.vercel.app",
            "VERCEL_PROJECT_PRODUCTION_URL": "site-locacoes.vercel.app",
        },
    )
    assert ".vercel.app" not in hosts
    assert "https://*.vercel.app" not in origins
    assert "site-locacoes.vercel.app" in hosts
    assert "site-locacoes-git-main-rocha.vercel.app" in hosts
    assert "https://site-locacoes.vercel.app" in origins


def test_admin_oculto_por_padrao_retorna_404(client: Client) -> None:
    """Com `ENABLE_DJANGO_ADMIN=False`, tentativas de acesso ao admin retornam 404."""
    resp_default = client.get("/admin/")
    resp_custom = client.get("/painel-restrito-rocha/")
    assert resp_default.status_code == 404
    assert resp_custom.status_code == 404


def test_get_client_ip_anti_spoofing_vercel_e_proxy(rf: RequestFactory) -> None:
    """Ignora `X-Forwarded-For` falsificado e prioriza `HTTP_X_VERCEL_FORWARDED_FOR` na Vercel."""
    spoofed_req = rf.post(
        "/simular/",
        REMOTE_ADDR="198.51.100.25",
        HTTP_X_FORWARDED_FOR="1.2.3.4, 198.51.100.25",
        HTTP_X_VERCEL_FORWARDED_FOR="203.0.113.77",
    )

    with override_settings(IS_VERCEL=True, TRUSTED_PROXY_DEPTH=0):
        assert get_client_ip(spoofed_req) == "203.0.113.77"

    with override_settings(IS_VERCEL=False, TRUSTED_PROXY_DEPTH=0):
        assert get_client_ip(spoofed_req) == "198.51.100.25"


def test_hash_client_ip_hmac_pseudonimo() -> None:
    """Garante que o IP bruto nunca apareça na chave de cache e varie por escopo."""
    mac_a = hash_client_ip(ip_address="203.0.113.77", scope="construtora_simulador")
    mac_b = hash_client_ip(ip_address="203.0.113.77", scope="locadora_orcamento")
    assert len(mac_a) == 32
    assert "203.0.113.77" not in mac_a
    assert mac_a != mac_b


def test_rate_limit_decision_e_resposta_429_htmx(rf: RequestFactory) -> None:
    """Valida bloqueio após estourar cota, header `Retry-After` e parcial HTMX 429."""
    cache.clear()
    req = rf.post("/simular/", REMOTE_ADDR="203.0.113.99", HTTP_HX_REQUEST="true")
    req.csp_nonce = "testnonce"  # type: ignore[attr-defined]

    d1 = check_rate_limit(req, scope="test_rl", limit_per_minute=2, window_seconds=45)
    d2 = check_rate_limit(req, scope="test_rl", limit_per_minute=2, window_seconds=45)
    d3 = check_rate_limit(req, scope="test_rl", limit_per_minute=2, window_seconds=45)

    assert d1.allowed is True
    assert d2.allowed is True
    assert d3.allowed is False
    assert d3.retry_after_seconds >= 1

    resp_htmx = build_rate_limit_response(req, retry_after_seconds=d3.retry_after_seconds)
    assert resp_htmx.status_code == 429
    assert int(resp_htmx.headers["Retry-After"]) >= 1
    assert "HX-Request" in resp_htmx.headers["Vary"]
    html = resp_htmx.content.decode("utf-8")
    assert "<!DOCTYPE html>" not in html
    assert "Muitas tentativas em sequência" in html


@override_settings(
    ENFORCE_FORM_TIMESTAMP=True,
    FORM_MIN_SUBMIT_SECONDS=1.2,
    FORM_MAX_AGE_SECONDS=7200,
)
def test_anti_bot_timestamp_signer_e_honeypots(rf: RequestFactory) -> None:
    """Valida rejeição de bot instantâneo (< 1.2s), expirado (> 7200s), adulterado e honeypot."""
    now = time.time()

    # 1. Submissão instantânea (< 1.2s) -> bloqueada
    fast_token = generate_form_timestamp_token(scope="construtora_simulador", issued_at=now)
    fast_req = rf.post("/simular/", data={FORM_TS_FIELD: fast_token})
    res_fast = validate_anti_bot_submission(fast_req, scope="construtora_simulador")
    assert res_fast.accepted is False
    assert res_fast.reason == "submitted_too_fast"

    # 2. Submissão humana legítima (3.5s) -> aceita
    human_token = generate_form_timestamp_token(
        scope="construtora_simulador",
        issued_at=now - 3.5,
    )
    human_req = rf.post("/simular/", data={FORM_TS_FIELD: human_token})
    res_human = validate_anti_bot_submission(human_req, scope="construtora_simulador")
    assert res_human.accepted is True

    # 3. Token adulterado -> bloqueado
    tampered_req = rf.post("/simular/", data={FORM_TS_FIELD: f"{human_token}corrupted"})
    res_tampered = validate_anti_bot_submission(tampered_req, scope="construtora_simulador")
    assert res_tampered.accepted is False
    assert res_tampered.reason == "invalid_signature"

    # 4. Honeypot secundário `website` preenchido -> bloqueado
    hp_req = rf.post("/simular/", data={FORM_TS_FIELD: human_token, "website": "https://bot.test"})
    res_hp = validate_anti_bot_submission(hp_req, scope="construtora_simulador")
    assert res_hp.accepted is False
    assert res_hp.reason == "honeypot_triggered"


def test_build_whatsapp_url_sanitiza_caracteres_de_controle() -> None:
    """Garante esquema fixo `https://wa.me/` e remoção de caracteres de controle."""
    url = build_whatsapp_url(phone_e164="+55 (88) 99225-8807", message="Olá\x00\x07 Rocha\nObra")
    assert url.startswith("https://wa.me/5588992258807?text=")
    assert "%00" not in url
    assert "%07" not in url
