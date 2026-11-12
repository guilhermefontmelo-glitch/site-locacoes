"""Views transversais: healthcheck operacional e handlers seguros de erros HTTP."""

from pathlib import Path

from django.conf import settings
from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    HttpResponsePermanentRedirect,
    JsonResponse,
)
from django.shortcuts import render

FAVICON_PADRAO = Path(settings.BASE_DIR) / "static" / "img" / "favicon" / "favicon.ico"
FAVICON_COLETADO = Path(settings.STATIC_ROOT) / "img" / "favicon" / "favicon.ico"


def healthcheck_view(request: HttpRequest) -> JsonResponse:  # noqa: ARG001
    """Retorna status saudável da aplicação para monitoramento sem expor dados sensíveis."""
    return JsonResponse({"status": "ok", "service": "rocha-construtora"})


def favicon_view(request: HttpRequest) -> FileResponse:  # noqa: ARG001
    """Serve `/favicon.ico` na raiz mesmo com os estáticos sob `/static/`."""
    caminho = FAVICON_PADRAO if FAVICON_PADRAO.is_file() else FAVICON_COLETADO
    if not caminho.is_file():
        raise Http404("Favicon não encontrado.")

    resposta = FileResponse(caminho.open("rb"), content_type="image/x-icon")
    resposta["Cache-Control"] = "public, max-age=604800, immutable"
    return resposta


def redirect_locadora_legado_view(
    request: HttpRequest,
    caminho: str = "",
) -> HttpResponsePermanentRedirect:
    """Redireciona 301 o prefixo antigo `/locadora/` para a rota equivalente na raiz.

    Preserva subrotas (`/locadora/equipamentos/x/` → `/equipamentos/x/`) e a query
    string (importante para links antigos de PDF da caderneta: `?t=<token>`).
    """
    destino = f"/{caminho.lstrip('/')}"
    query_string = request.META.get("QUERY_STRING", "")
    if query_string:
        destino = f"{destino}?{query_string}"
    return HttpResponsePermanentRedirect(destino)


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
