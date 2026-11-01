"""Configurações exclusivas para desenvolvimento local e inspeção de performance."""

import importlib.util

from .base import *

DEBUG: bool = env.bool("DJANGO_DEBUG", default=True)
ENABLE_DJANGO_ADMIN = env.bool("ENABLE_DJANGO_ADMIN", default=True)

# Em ambiente estritamente local, permite chave do .env ou chave efêmera de dev
SECRET_KEY: str = env(
    "DJANGO_SECRET_KEY",
    default="local-dev-only-key-nao-usar-em-producao-rocha-construtora-2026-seguro",
)

ALLOWED_HOSTS: list[str] = env.list(
    "DJANGO_ALLOWED_HOSTS",
    default=["127.0.0.1", "localhost", "[::1]", "testserver"],
)

CSRF_TRUSTED_ORIGINS: list[str] = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=["http://127.0.0.1:8000", "http://localhost:8000"],
)

# Cookies sem exigência de TLS em localhost HTTP
SESSION_COOKIE_SECURE: bool = False
CSRF_COOKIE_SECURE: bool = False

# Recarregamento instantâneo de estáticos durante desenvolvimento
WHITENOISE_USE_FINDERS: bool = True
WHITENOISE_AUTOREFRESH: bool = True

MAILERS = {
    "default": {
        "BACKEND": "django.core.mail.backends.console.EmailBackend",
    },
}

# ==============================================================================
# DJANGO DEBUG TOOLBAR (INSPEÇÃO DE N+1 QUERIES E TEMPO DE RENDERIZAÇÃO)
# ==============================================================================
if DEBUG and importlib.util.find_spec("debug_toolbar") is not None:
    INSTALLED_APPS = [*INSTALLED_APPS, "debug_toolbar"]
    MIDDLEWARE = [
        "debug_toolbar.middleware.DebugToolbarMiddleware",
        *MIDDLEWARE,
    ]
    INTERNAL_IPS: list[str] = ["127.0.0.1", "localhost"]
    DEBUG_TOOLBAR_CONFIG = {
        "RESULTS_CACHE_SIZE": 50,
        "UPDATE_ON_FETCH": True,
    }
