"""Middlewares de segurança defensiva: Content Security Policy (Nonce) e isolamento HTTP."""

import secrets
from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

_STRICT_PERMISSIONS_POLICY: str = (
    "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), "
    "display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), "
    "gyroscope=(), hid=(), idle-detection=(), local-fonts=(), magnetometer=(), "
    "microphone=(), midi=(), payment=(), picture-in-picture=(), "
    "publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), "
    "web-share=(), xr-spatial-tracking=()"
)


class ContentSecurityPolicyMiddleware:
    """Injeta Nonce criptográfico por requisição e cabeçalhos estritos Zero-Trust."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        """Armazena o próximo elo da cadeia de middlewares do Django."""
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """Gera `request.csp_nonce` exclusivo e aplica CSP, COOP, CORP e Permissions-Policy."""
        nonce: str = secrets.token_urlsafe(18)
        request.csp_nonce = nonce  # type: ignore[attr-defined]

        response: HttpResponse = self.get_response(request)

        if "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = self._build_csp_header(nonce=nonce)

        response.setdefault("Permissions-Policy", _STRICT_PERMISSIONS_POLICY)
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        response.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        return response

    @staticmethod
    def _build_csp_header(*, nonce: str) -> str:
        """Constrói CSP Zero-CDN com `default-src 'none'` e `style-src-attr 'none'`."""
        directives: list[str] = [
            "default-src 'none'",
            f"script-src 'self' 'nonce-{nonce}'",
            f"style-src 'self' 'nonce-{nonce}'",
            "style-src-attr 'none'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ]
        if getattr(settings, "CSP_UPGRADE_INSECURE_REQUESTS", False):
            directives.append("upgrade-insecure-requests")
        return "; ".join(directives)
