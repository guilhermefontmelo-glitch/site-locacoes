"""Rotas da vertical Rocha Construtora & Financiamento Caixa Habitacional."""

from django.urls import URLPattern, path

from apps.construtora import views

app_name = "construtora"

urlpatterns: list[URLPattern] = [
    path("", views.home_construtora_view, name="home"),
    path(
        "etapas/<int:ordem>/",
        views.etapa_detalhe_numero_htmx_view,
        name="etapa_detalhe_numero",
    ),
    path("etapas/<slug:slug>/", views.etapa_detalhe_htmx_view, name="etapa_detalhe"),
    path("simular-mcmv/", views.simular_financiamento_view, name="simular_mcmv"),
    path("simular-financiamento/", views.simular_financiamento_view, name="simular_financiamento"),
]
