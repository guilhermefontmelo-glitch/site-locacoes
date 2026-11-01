"""Utilitários de segurança defensiva: URLs externas seguras e proteção Anti-Bot criptográfica."""

import secrets
import time
import urllib.parse
from dataclasses import dataclass

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import HttpRequest

FORM_TS_SALT: str = "rocha.anti_bot.timestamp.v1"
FORM_TS_FIELD: str = "form_ts_token"
HONEYPOT_FIELD_NAMES: tuple[str, ...] = ("website", "website_url_trap")


@dataclass(frozen=True, slots=True)
class AntiBotValidationResult:
    """Resultado imutável da verificação de honeypot e janela temporal assinada."""

    accepted: bool
    reason: str


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
    field_name: str | None = None,
) -> bool:
    """Retorna True caso um bot automatizado tenha preenchido qualquer campo Honeypot."""
    fields_to_check: tuple[str, ...] = (
        (field_name,) if field_name is not None else HONEYPOT_FIELD_NAMES
    )
    for trap_field in fields_to_check:
        trap_value: str = str(request.POST.get(trap_field, "")).strip()
        if trap_value:
            return True
    return False


def generate_form_timestamp_token(
    *,
    scope: str = "public_form",
    issued_at: float | None = None,
) -> str:
    """Assina criptograficamente o instante de emissão do formulário via `TimestampSigner`."""
    signer = TimestampSigner(salt=FORM_TS_SALT)
    iat: float = round(time.time() if issued_at is None else issued_at, 3)
    payload: dict[str, str | float] = {
        "scope": scope,
        "iat": iat,
        "n": secrets.token_hex(6),
    }
    return str(signer.sign_object(payload))


def validate_anti_bot_submission(
    request: HttpRequest,
    *,
    scope: str = "public_form",
) -> AntiBotValidationResult:
    """Valida campos honeypot e janela temporal humana (`1.2s` a `7200s`) assinada."""
    if is_honeypot_triggered(request):
        return AntiBotValidationResult(accepted=False, reason="honeypot_triggered")

    if not getattr(settings, "ENFORCE_FORM_TIMESTAMP", True):
        return AntiBotValidationResult(accepted=True, reason="timestamp_bypass_disabled")

    raw_token: str = str(request.POST.get(FORM_TS_FIELD, "")).strip()
    if not raw_token:
        return AntiBotValidationResult(accepted=False, reason="missing_timestamp_token")

    max_age: int = int(getattr(settings, "FORM_MAX_AGE_SECONDS", 7200))
    min_seconds: float = float(getattr(settings, "FORM_MIN_SUBMIT_SECONDS", 1.2))
    signer = TimestampSigner(salt=FORM_TS_SALT)

    try:
        payload = signer.unsign_object(raw_token, max_age=max_age)
    except SignatureExpired:
        return AntiBotValidationResult(accepted=False, reason="expired_timestamp_token")
    except BadSignature:
        return AntiBotValidationResult(accepted=False, reason="invalid_signature")

    if not isinstance(payload, dict):
        return AntiBotValidationResult(accepted=False, reason="malformed_payload")

    token_scope = payload.get("scope")
    if token_scope not in (scope, "public_form"):
        return AntiBotValidationResult(accepted=False, reason="scope_mismatch")

    raw_iat = payload.get("iat")
    if not isinstance(raw_iat, (int, float)):
        return AntiBotValidationResult(accepted=False, reason="malformed_iat")

    elapsed: float = time.time() - float(raw_iat)
    if elapsed < min_seconds:
        return AntiBotValidationResult(accepted=False, reason="submitted_too_fast")
    if elapsed > float(max_age):
        return AntiBotValidationResult(accepted=False, reason="expired_timestamp_token")

    return AntiBotValidationResult(accepted=True, reason="ok")
