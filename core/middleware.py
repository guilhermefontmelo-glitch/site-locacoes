"""Middlewares de segurança defensiva: Content Security Policy (Nonce) e isolamento HTTP."""

import secrets
from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse


class ContentSecurityPolicyMiddleware:
    """Injeta Nonce criptográfico por requisição e cabeçalhos estritos de segurança."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        """Armazena o próximo elo da cadeia de middlewares do Django."""
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """Gera `request.csp_nonce` exclusivo e aplica políticas CSP e Permissions-Policy."""
        nonce: str = secrets.token_urlsafe(18)
        request.csp_nonce = nonce  # type: ignore[attr-defined]

        response: HttpResponse = self.get_response(request)

        # Não sobrescreve CSP customizado caso uma view específica já o tenha definido
        if "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = self._build_csp_header(nonce=nonce)

        response.setdefault(
            "Permissions-Policy",
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()",
        )
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return response

    @staticmethod
    def _build_csp_header(*, nonce: str) -> str:
        """Constrói a diretiva CSP sem 'unsafe-inline' ou 'unsafe-eval' em scripts."""
        directives: list[str] = [
            "default-src 'self'",
            f"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net",
            f"style-src 'self' 'nonce-{nonce}' https://fonts.googleapis.com",
            "style-src-attr 'unsafe-inline'",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
        if getattr(settings, "CSP_UPGRADE_INSECURE_REQUESTS", False):
            directives.append("upgrade-insecure-requests")
        return "; ".join(directives)

