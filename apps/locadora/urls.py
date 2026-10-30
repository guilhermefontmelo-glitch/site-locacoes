"""Rotas da área integrada Rocha Locações de Equipamentos."""

from django.urls import URLPattern, path

from apps.locadora import views

app_name = "locadora"

urlpatterns: list[URLPattern] = [
    path("", views.catalogo_locadora_view, name="catalogo"),
    path(
        "equipamentos/<slug:slug>/",
        views.equipamento_modal_htmx_view,
        name="equipamento_modal",
    ),
    path(
        "solicitar-orcamento/",
        views.solicitar_orcamento_htmx_view,
        name="solicitar_orcamento",
    ),
]

