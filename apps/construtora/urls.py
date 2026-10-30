"""Rotas da vertical principal Rocha Construtora & Financiamento Caixa/MCMV."""

from django.urls import URLPattern, path

from apps.construtora import views

app_name = "construtora"

urlpatterns: list[URLPattern] = [
    path("", views.home_construtora_view, name="home"),
    path("etapas/<slug:slug>/", views.etapa_detalhe_htmx_view, name="etapa_detalhe"),
    path("simular-mcmv/", views.simular_financiamento_view, name="simular_mcmv"),
]

