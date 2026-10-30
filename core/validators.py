"""Validadores e sanitizadores reutilizáveis de entradas no backend."""

from django.core.exceptions import ValidationError


def sanitize_plain_text(value: str, *, max_length: int = 240) -> str:
    """Remove caracteres de controle invisíveis, espaços redundantes e aplica limite."""
    cleaned_chars: list[str] = [
        ch for ch in value.strip() if ord(ch) >= 32 and ord(ch) != 127
    ]
    normalized: str = " ".join("".join(cleaned_chars).split())
    return normalized[:max_length]


def validate_brazilian_phone(value: str) -> str:
    """Valida telefone/WhatsApp brasileiro (DDD + 8 ou 9 dígitos) e retorna formato limpo."""
    digits: str = "".join(ch for ch in value if ch.isdigit())
    if digits.startswith("55") and len(digits) in (12, 13):
        digits = digits[2:]

    if len(digits) not in (10, 11):
        msg = "Informe um WhatsApp válido com DDD (ex: 88 99999-9999)."
        raise ValidationError(msg)

    ddd: int = int(digits[:2])
    if ddd < 11 or ddd > 99:
        msg = "O DDD informado não é válido."
        raise ValidationError(msg)

    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"

