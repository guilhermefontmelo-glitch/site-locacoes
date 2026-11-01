"""Validadores estritos RFC 1123 para `ALLOWED_HOSTS` e `CSRF_TRUSTED_ORIGINS` em produção."""

import os
import re
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

_HOSTNAME_RE: re.Pattern[str] = re.compile(
    r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)


def validate_strict_hostname(raw_host: str) -> str:
    """Valida hostname RFC 1123 estrito, rejeitando wildcards (`.vercel.app` ou `*`)."""
    candidate: str = raw_host.strip().lower()
    if candidate.startswith(("http://", "https://")):
        parsed = urlsplit(candidate)
        candidate = (parsed.hostname or "").strip().lower()
    if not candidate or "*" in candidate or candidate.startswith("."):
        msg = (
            f"Host inválido ou com wildcard proibido em produção: {raw_host!r}. "
            "Informe apenas FQDNs explícitos (ex.: site-locacoes.vercel.app)."
        )
        raise ImproperlyConfigured(msg)
    if not _HOSTNAME_RE.fullmatch(candidate):
        msg = f"Host fora do padrão RFC 1123 em produção: {raw_host!r}."
        raise ImproperlyConfigured(msg)
    return candidate


def validate_strict_origin(raw_origin: str) -> str:
    """Valida origem HTTPS explícita para `CSRF_TRUSTED_ORIGINS` sem wildcards."""
    candidate: str = raw_origin.strip()
    if "*" in candidate:
        msg = f"Origem CSRF com wildcard proibido em produção: {raw_origin!r}."
        raise ImproperlyConfigured(msg)
    parsed = urlsplit(candidate)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/"):
        msg = (
            f"Origem CSRF inválida em produção: {raw_origin!r}. "
            "Use esquema https:// e domínio explícito sem caminho."
        )
        raise ImproperlyConfigured(msg)
    host: str = validate_strict_hostname(parsed.hostname)
    port_suffix: str = f":{parsed.port}" if parsed.port else ""
    return f"https://{host}{port_suffix}"


def resolve_strict_hosts_and_origins(
    *,
    configured_hosts: list[str],
    configured_origins: list[str],
    is_vercel: bool,
    environ_map: dict[str, str] | None = None,
) -> tuple[list[str], list[str]]:
    """Resolve `ALLOWED_HOSTS` e `CSRF_TRUSTED_ORIGINS` sem wildcards cruzados na Vercel."""
    env_source: dict[str, str] = dict(os.environ) if environ_map is None else environ_map
    hosts: list[str] = []
    origins: list[str] = []

    for item in configured_hosts:
        if item.strip():
            clean_host = validate_strict_hostname(item)
            if clean_host not in hosts:
                hosts.append(clean_host)

    for item in configured_origins:
        if item.strip():
            clean_origin = validate_strict_origin(item)
            if clean_origin not in origins:
                origins.append(clean_origin)

    if is_vercel:
        vercel_candidates: list[str] = ["site-locacoes.vercel.app"]
        for vercel_env_var in (
            "VERCEL_URL",
            "VERCEL_PROJECT_PRODUCTION_URL",
            "VERCEL_BRANCH_URL",
        ):
            env_val = env_source.get(vercel_env_var, "").strip()
            if env_val:
                vercel_candidates.append(env_val)

        for raw_vercel_host in vercel_candidates:
            clean_host = validate_strict_hostname(raw_vercel_host)
            if clean_host not in hosts:
                hosts.append(clean_host)
            origin = f"https://{clean_host}"
            if origin not in origins:
                origins.append(origin)

    if not hosts:
        msg = "DJANGO_ALLOWED_HOSTS deve conter ao menos um host explícito válido em produção."
        raise ImproperlyConfigured(msg)

    return hosts, origins
