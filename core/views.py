"""Views transversais: healthcheck operacional e handlers seguros de erros HTTP."""

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render


def healthcheck_view(request: HttpRequest) -> JsonResponse:  # noqa: ARG001
    """Retorna status saudável da aplicação para monitoramento sem expor dados sensíveis."""
    return JsonResponse({"status": "ok", "service": "rocha-construtora"})


def error_400_view(
    request: HttpRequest,
    exception: Exception | None = None,  # noqa: ARG001
) -> HttpResponse:
    """Renderiza página segura para requisições malformadas (HTTP 400)."""
    return render(request, "errors/400.html", status=400)


def error_403_view(
    request: HttpRequest,
    exception: Exception | None = None,  # noqa: ARG001
) -> HttpResponse:
    """Renderiza página segura para acesso negado ou falha de CSRF (HTTP 403)."""
    return render(request, "errors/403.html", status=403)


def error_404_view(
    request: HttpRequest,
    exception: Exception | None = None,  # noqa: ARG001
) -> HttpResponse:
    """Renderiza página segura para rotas inexistentes (HTTP 404)."""
    return render(request, "errors/404.html", status=404)


def error_500_view(request: HttpRequest) -> HttpResponse:
    """Renderiza página segura para falhas internas sem expor stack trace (HTTP 500)."""
    return render(request, "errors/500.html", status=500)
