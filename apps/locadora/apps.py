"""Configuração do aplicativo `apps.locadora`."""

from django.apps import AppConfig


class LocadoraConfig(AppConfig):
    """Registra a vertical de Locação de Equipamentos para Construção Civil."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.locadora"
    verbose_name = "Rocha Locações de Equipamentos"
