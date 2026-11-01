"""Roteamento raiz de URLs da plataforma Rocha Construtora & Locações."""

import contextlib

from django.conf import settings
from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path

from core import views as core_views

urlpatterns: list[URLPattern | URLResolver] = [
    path("healthz/", core_views.healthcheck_view, name="healthcheck"),
    path("locadora/", include("apps.locadora.urls", namespace="locadora")),
    path("", include("apps.construtora.urls", namespace="construtora")),
]

if getattr(settings, "ENABLE_DJANGO_ADMIN", False):
    urlpatterns = [
        path(settings.DJANGO_ADMIN_URL, admin.site.urls),
        *urlpatterns,
    ]

handler400 = "core.views.error_400_view"
handler403 = "core.views.error_403_view"
handler404 = "core.views.error_404_view"
handler500 = "core.views.error_500_view"

if settings.DEBUG:
    with contextlib.suppress(ImportError):
        import debug_toolbar

        urlpatterns = [
            path("__debug__/", include(debug_toolbar.urls)),
            *urlpatterns,
        ]
