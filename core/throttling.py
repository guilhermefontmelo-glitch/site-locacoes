"""Controle de vazão (Rate Limiting) endurecido com HMAC-SHA256 e proteção anti-spoofing."""

import hashlib
import hmac
import ipaddress
import math
import os
import time
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render
from django.utils.cache import patch_vary_headers


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    """Decisão determinística do motor de Rate Limiting por escopo e IP."""

    allowed: bool
    retry_after_seconds: int
    limit: int
    remaining: int


def _normalize_ip(raw_value: str) -> str | None:
    """Valida e normaliza endereço IPv4 ou IPv6; retorna None quando malformado."""
    candidate: str = raw_value.strip()
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def get_client_ip(request: HttpRequest) -> str:
    """Extrai o IP real do cliente resistindo a falsificação de `X-Forwarded-For`."""
    is_vercel: bool = bool(getattr(settings, "IS_VERCEL", False) or os.environ.get("VERCEL"))
    if is_vercel:
        vercel_forwarded: str = str(request.META.get("HTTP_X_VERCEL_FORWARDED_FOR", "")).strip()
        if vercel_forwarded:
            first_hop = vercel_forwarded.split(",")[0].strip()
            normalized_vercel_ip = _normalize_ip(first_hop)
            if normalized_vercel_ip is not None:
                return normalized_vercel_ip

    trusted_depth: int = int(getattr(settings, "TRUSTED_PROXY_DEPTH", 0))
    if trusted_depth > 0:
        forwarded_for: str = str(request.META.get("HTTP_X_FORWARDED_FOR", "")).strip()
        if forwarded_for:
            hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
            if hops:
                selected_hop = hops[-min(trusted_depth, len(hops))]
                normalized_hop = _normalize_ip(selected_hop)
                if normalized_hop is not None:
                    return normalized_hop

    remote_addr: str = str(request.META.get("REMOTE_ADDR", "")).strip()
    normalized_remote = _normalize_ip(remote_addr)
    return normalized_remote if normalized_remote is not None else "127.0.0.1"


def hash_client_ip(*, ip_address: str, scope: str) -> str:
    """Deriva identificador pseudônimo irreversível via HMAC-SHA256 com `SECRET_KEY`."""
    secret_bytes: bytes = str(settings.SECRET_KEY).encode()
    message_bytes: bytes = f"{scope}:{ip_address}".encode()
    return hmac.new(secret_bytes, message_bytes, hashlib.sha256).hexdigest()[:32]


def check_rate_limit(
    request: HttpRequest,
    *,
    scope: str,
    limit_per_minute: int | None = None,
    window_seconds: int = 60,
) -> RateLimitDecision:
    """Avalia e registra o consumo de requisições na janela deslizante por escopo."""
    max_requests: int = (
        limit_per_minute
        if limit_per_minute is not None
        else int(getattr(settings, "RATE_LIMIT_REQUESTS_PER_MINUTE", 10))
    )
    safe_window: int = max(1, window_seconds)
    client_ip: str = get_client_ip(request)
    ip_mac: str = hash_client_ip(ip_address=client_ip, scope=scope)
    count_key: str = f"rl:cnt:{scope}:{ip_mac}"
    exp_key: str = f"rl:exp:{scope}:{ip_mac}"

    now: float = time.monotonic()
    raw_exp = cache.get(exp_key)
    reset_at: float = float(raw_exp) if isinstance(raw_exp, (int, float)) else now + safe_window
    retry_after: int = max(1, math.ceil(reset_at - now))

    current_count: int = int(cache.get(count_key, 0))
    if current_count >= max_requests:
        return RateLimitDecision(
            allowed=False,
            retry_after_seconds=retry_after,
            limit=max_requests,
            remaining=0,
        )

    if current_count == 0:
        reset_at = now + safe_window
        cache.set(count_key, 1, timeout=safe_window)
        cache.set(exp_key, reset_at, timeout=safe_window)
        new_count = 1
    else:
        try:
            new_count = int(cache.incr(count_key))
        except ValueError:
            new_count = current_count + 1
            cache.set(count_key, new_count, timeout=retry_after)

    return RateLimitDecision(
        allowed=True,
        retry_after_seconds=max(1, math.ceil(reset_at - now)),
        limit=max_requests,
        remaining=max(0, max_requests - new_count),
    )


def is_rate_limited(
    request: HttpRequest,
    *,
    scope: str,
    limit_per_minute: int | None = None,
) -> bool:
    """Verifica se o cliente excedeu o limite de requisições por minuto no escopo."""
    decision = check_rate_limit(
        request,
        scope=scope,
        limit_per_minute=limit_per_minute,
    )
    return not decision.allowed


def build_rate_limit_response(
    request: HttpRequest,
    *,
    retry_after_seconds: int = 60,
) -> HttpResponse:
    """Constrói resposta HTTP 429 com `Retry-After` compatível com HTMX e SSR."""
    safe_retry: int = max(1, int(retry_after_seconds))
    is_htmx: bool = request.headers.get("HX-Request") == "true"
    template_name: str = "errors/partials/_rate_limit_429.html" if is_htmx else "errors/429.html"
    response: HttpResponse = render(
        request,
        template_name,
        {"retry_after_seconds": safe_retry},
        status=429,
    )
    response["Retry-After"] = str(safe_retry)
    response["Cache-Control"] = "private, no-store"
    patch_vary_headers(response, ("HX-Request", "Accept-Encoding"))
    return response
