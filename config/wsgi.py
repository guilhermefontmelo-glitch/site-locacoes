"""Configuração WSGI para produção (Vercel Serverless / Gunicorn) e execução local."""

import os

from django.core.wsgi import get_wsgi_application

default_settings = (
    "config.settings.production" if os.environ.get("VERCEL") else "config.settings.local"
)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", default_settings)

application = get_wsgi_application()
# Alias `app` garantido para total compatibilidade com runtimes serverless da Vercel
app = application
