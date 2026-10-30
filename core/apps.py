"""Configuração do aplicativo transversal `core`."""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Registra a camada transversal de segurança e infraestrutura."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "Núcleo & Segurança"

