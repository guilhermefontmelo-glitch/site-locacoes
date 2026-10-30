#!/usr/bin/env python
"""Utilitário de linha de comando administrativo do Django."""

import os
import sys


def main() -> None:
    """Inicializa o ambiente modular do Django e executa o comando administrativo."""
    default_settings = (
        "config.settings.production"
        if os.environ.get("VERCEL")
        else "config.settings.local"
    )
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", default_settings)
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        msg = (
            "Não foi possível importar o Django. Verifique se ele está instalado e "
            "se o ambiente virtual (.venv) está ativo."
        )
        raise ImportError(msg) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
