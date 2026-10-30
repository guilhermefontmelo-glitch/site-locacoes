"""Configuração ASGI do projeto Rocha Construtora & Locações."""

import os

from django.core.asgi import get_asgi_application

default_settings = (
    "config.settings.production"
    if os.environ.get("VERCEL")
    else "config.settings.local"
)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", default_settings)

application = get_asgi_application()
