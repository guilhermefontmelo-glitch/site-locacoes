"""Controle leve de vazão (Rate Limiting) baseado no cache do Django para rotas públicas."""

import hashlib

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest


def get_client_ip(request: HttpRequest) -> str:
    """Extrai o IP do cliente considerando cabeçalho de proxy reverso confiável (Vercel)."""
    forwarded_for: str = str(request.META.get("HTTP_X_FORWARDED_FOR", "")).strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return str(request.META.get("REMOTE_ADDR", "127.0.0.1")).strip()


def is_rate_limited(
    request: HttpRequest,
    *,
    scope: str,
    limit_per_minute: int | None = None,
) -> bool:
    """Verifica e incrementa o contador de requisições por minuto do IP no escopo informado."""
    max_requests: int = (
        limit_per_minute
        if limit_per_minute is not None
        else int(getattr(settings, "RATE_LIMIT_REQUESTS_PER_MINUTE", 10))
    )
    client_ip: str = get_client_ip(request)
    ip_hash: str = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:16]
    cache_key: str = f"rl:{scope}:{ip_hash}"

    current_count: int = int(cache.get(cache_key, 0))
    if current_count >= max_requests:
        return True

    if current_count == 0:
        cache.set(cache_key, 1, timeout=60)
    else:
        try:
            cache.incr(cache_key)
        except ValueError:
            cache.set(cache_key, current_count + 1, timeout=60)
    return False

