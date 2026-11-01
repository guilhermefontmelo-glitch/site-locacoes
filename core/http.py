"""Utilitários HTTP para isolamento de cache HTMX (`Vary: HX-Request`) e bfcache seguro."""

from collections.abc import Callable
from functools import wraps

from django.http import HttpRequest, HttpResponse
from django.utils.cache import patch_vary_headers


def add_htmx_vary_headers[R: HttpResponse](response: R) -> R:
    """Garante `Vary: HX-Request, Accept-Encoding` e previne envenenamento de cache."""
    patch_vary_headers(response, ("HX-Request", "Accept-Encoding"))
    if "Cache-Control" not in response:
        response["Cache-Control"] = "private, no-cache, must-revalidate"
    return response


def htmx_vary_response[**P, R: HttpResponse](
    view_func: Callable[P, R],
) -> Callable[P, R]:
    """Decorator que aplica cabeçalhos `Vary: HX-Request` e revalidação de nonce CSP."""

    @wraps(view_func)
    def _wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
        response: R = view_func(*args, **kwargs)
        return add_htmx_vary_headers(response)

    return _wrapped


def is_htmx_request(request: HttpRequest) -> bool:
    """Retorna True quando a requisição foi originada pelo cliente HTMX."""
    return request.headers.get("HX-Request") == "true"
