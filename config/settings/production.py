"""Configurações de Produção com Hardening Completo e suporte nativo à Vercel."""

import os
import tempfile
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from ._validators import (
    resolve_strict_hosts_and_origins,
    validate_strict_hostname,
    validate_strict_origin,
)
from .base import *

_resolve_strict_hosts_and_origins = resolve_strict_hosts_and_origins
_validate_strict_hostname = validate_strict_hostname
_validate_strict_origin = validate_strict_origin

# Hardening: DEBUG jamais pode ser ativado em produção e Admin permanece oculto por padrão
DEBUG: bool = False
ENABLE_DJANGO_ADMIN = env.bool("ENABLE_DJANGO_ADMIN", default=False)

IS_VERCEL: bool = bool(os.environ.get("VERCEL"))

# ==============================================================================
# VALIDAÇÃO FAIL-FAST DE SECRET_KEY
# ==============================================================================
SECRET_KEY: str = env("DJANGO_SECRET_KEY", default="")
if not SECRET_KEY or SECRET_KEY.startswith("django-insecure") or len(SECRET_KEY) < 32:
    msg = (
        "DJANGO_SECRET_KEY ausente ou insegura em produção. Configure uma chave criptográfica "
        "com ao menos 32 caracteres nas Environment Variables da hospedagem (Vercel)."
    )
    raise ImproperlyConfigured(msg)

# ==============================================================================
# ALLOWED_HOSTS & CSRF_TRUSTED_ORIGINS ESTRITOS (ZERO WILDCARD VERCEL)
# ==============================================================================
ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS = resolve_strict_hosts_and_origins(
    configured_hosts=env.list("DJANGO_ALLOWED_HOSTS", default=[]),
    configured_origins=env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[]),
    is_vercel=IS_VERCEL,
)

# ==============================================================================
# HARDENING DE TRANSPORTE (TLS, HSTS E COOKIES SEGUROS)
# ==============================================================================
SECURE_PROXY_SSL_HEADER: tuple[str, str] = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT: bool = env.bool("SECURE_SSL_REDIRECT", default=True)

SESSION_COOKIE_SECURE: bool = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

CSRF_COOKIE_SECURE: bool = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"

SECURE_HSTS_SECONDS: int = env.int("SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS: bool = True
SECURE_HSTS_PRELOAD: bool = True

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
CSP_UPGRADE_INSECURE_REQUESTS = True

# ==============================================================================
# COMPATIBILIDADE SERVERLESS VERCEL (FILESYSTEM SOMENTE-LEITURA)
# ==============================================================================
if IS_VERCEL and not os.environ.get("DATABASE_URL"):
    SESSION_ENGINE: str = "django.contrib.sessions.backends.signed_cookies"
    DATABASES["default"]["NAME"] = Path(tempfile.gettempdir()) / "rocha_serverless.sqlite3"

# ==============================================================================
# ARQUIVOS ESTÁTICOS CACHEADOS E COMPRIMIDOS VIA WHITENOISE (MANIFEST + BROTLI)
# ==============================================================================
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

WHITENOISE_MANIFEST_STRICT: bool = False
WHITENOISE_USE_FINDERS: bool = IS_VERCEL
WHITENOISE_MAX_AGE: int = 31536000

# ==============================================================================
# LOGGING DE SEGURANÇA EM PRODUÇÃO (STDOUT PARA PAINEL DA VERCEL)
# ==============================================================================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "[{levelname}] {asctime} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured",
        },
    },
    "loggers": {
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}
