"""Configurações otimizadas para execução rápida da suíte de testes automatizados (pytest)."""

from .base import *

DEBUG: bool = False
SECRET_KEY: str = (
    "test-suite-secret-key-exclusiva-para-pytest-com-entropia-suficiente-64b"  # noqa: S105
)
ALLOWED_HOSTS: list[str] = ["testserver", "127.0.0.1", "localhost"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    },
}

# Acelera criação de fixtures em testes gerais (testes de Argon2 validam base.PASSWORD_HASHERS)
PASSWORD_HASHERS: list[str] = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

WHITENOISE_USE_FINDERS: bool = True
WHITENOISE_AUTOREFRESH: bool = False

