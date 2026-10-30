"""Configurações de Produção com Hardening Completo e suporte nativo à Vercel."""

import os
import tempfile
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from .base import *

# Hardening: DEBUG jamais pode ser ativado em produção
DEBUG: bool = False

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
# ALLOWED_HOSTS & CSRF_TRUSTED_ORIGINS (DOMÍNIOS PRÓPRIOS + VERCEL DEPLOYMENTS)
# ==============================================================================
ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", default=[])
CSRF_TRUSTED_ORIGINS: list[str] = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])

if IS_VERCEL:
    if ".vercel.app" not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(".vercel.app")
    if "https://*.vercel.app" not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append("https://*.vercel.app")
    for vercel_env_var in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        vercel_host = os.environ.get(vercel_env_var, "").strip()
        if vercel_host:
            if vercel_host not in ALLOWED_HOSTS:
                ALLOWED_HOSTS.append(vercel_host)
            origin = f"https://{vercel_host}"
            if origin not in CSRF_TRUSTED_ORIGINS:
                CSRF_TRUSTED_ORIGINS.append(origin)

if not ALLOWED_HOSTS:
    msg = "DJANGO_ALLOWED_HOSTS deve conter ao menos um host válido em produção."
    raise ImproperlyConfigured(msg)

# ==============================================================================
# HARDENING DE TRANSPORTE (TLS, HSTS E COOKIES SEGUROS)
# ==============================================================================
SECURE_PROXY_SSL_HEADER: tuple[str, str] = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT: bool = env.bool("SECURE_SSL_REDIRECT", default=True)

SESSION_COOKIE_SECURE: bool = True
SESSION_COOKIE_HTTPONLY: bool = True
SESSION_COOKIE_SAMESITE: str = "Lax"

CSRF_COOKIE_SECURE: bool = True
CSRF_COOKIE_HTTPONLY: bool = True
CSRF_COOKIE_SAMESITE: str = "Lax"

SECURE_HSTS_SECONDS: int = env.int("SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS: bool = True
SECURE_HSTS_PRELOAD: bool = True

SECURE_CONTENT_TYPE_NOSNIFF: bool = True
X_FRAME_OPTIONS: str = "DENY"
CSP_UPGRADE_INSECURE_REQUESTS: bool = True

# ==============================================================================
# COMPATIBILIDADE SERVERLESS VERCEL (FILESYSTEM SOMENTE-LEITURA)
# ==============================================================================
# Caso nenhum banco externo (DATABASE_URL) esteja configurado na Vercel, usa
# sessões em cookies assinados criptograficamente e caminho temporário seguro.
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

# Resiliência extra em builds serverless + cache imutável de 1 ano para assets com hash
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

