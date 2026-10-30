"""Arquivo legado desativado. Utilize o pacote modular `config/settings/`."""

from django.core.exceptions import ImproperlyConfigured

msg = (
    "O arquivo monolítico `config/settings.py` foi descontinuado conforme AI_RULES.md. "
    "Utilize `config.settings.local`, `config.settings.production` ou `config.settings.test`."
)
raise ImproperlyConfigured(msg)
