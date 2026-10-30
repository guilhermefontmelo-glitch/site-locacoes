"""Utilitários de segurança defensiva: URLs externas seguras e proteção Honeypot anti-bot."""

import urllib.parse

from django.http import HttpRequest


def build_whatsapp_url(*, phone_e164: str, message: str) -> str:
    """Gera URL `https://wa.me/` estritamente sanitizada contra Open Redirect e injeção."""
    digits_only: str = "".join(ch for ch in phone_e164 if ch.isdigit())
    if len(digits_only) < 10 or len(digits_only) > 15:
        digits_only = "5588992258807"

    cleaned_chars: list[str] = [
        ch for ch in message.strip() if ch == "\n" or (ord(ch) >= 32 and ord(ch) != 127)
    ]
    safe_message: str = "".join(cleaned_chars)[:1200]
    encoded_text: str = urllib.parse.quote(safe_message, safe="")
    return f"https://wa.me/{digits_only}?text={encoded_text}"


def is_honeypot_triggered(
    request: HttpRequest,
    *,
    field_name: str = "website_url_trap",
) -> bool:
    """Retorna True caso um bot automatizado tenha preenchido o campo oculto Honeypot."""
    trap_value: str = str(request.POST.get(field_name, "")).strip()
    return bool(trap_value)

