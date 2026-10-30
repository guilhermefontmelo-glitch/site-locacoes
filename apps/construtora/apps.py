"""Configuração do aplicativo `apps.construtora`."""

from django.apps import AppConfig


class ConstrutoraConfig(AppConfig):
    """Registra a vertical de Construção Financiada Caixa / Minha Casa Minha Vida."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.construtora"
    verbose_name = "Rocha Construtora & Financiamento MCMV"

