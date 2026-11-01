"""Configurações base compartilhadas entre todos os ambientes (Rocha Construtora & Locações)."""

from pathlib import Path

import environ

# Raiz do repositório: site-locacoes/
BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ADMIN_URL=(str, "painel-rocha-gestao/"),
    ROCHA_WHATSAPP_CONSTRUTORA=(str, "5588992258807"),
    ROCHA_WHATSAPP_LOCADORA=(str, "5588994248183"),
    RATE_LIMIT_REQUESTS_PER_MINUTE=(int, 10),
)

# Carrega `.env` local caso exista na raiz do repositório
ENV_FILE: Path = BASE_DIR / ".env"
if ENV_FILE.is_file():
    environ.Env.read_env(str(ENV_FILE))

# ==============================================================================
# APLICAÇÕES INSTALADAS (ARQUITETURA ENXUTA DE LANDING PAGE)
# ==============================================================================
DJANGO_APPS: list[str] = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS: list[str] = [
    "crispy_forms",
    "crispy_tailwind",
]

LOCAL_APPS: list[str] = [
    "core",
    "apps.construtora",
    "apps.locadora",
]

INSTALLED_APPS: list[str] = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ==============================================================================
# MIDDLEWARES OTIMIZADOS (SECURITY-BY-DESIGN + WHITENOISE)
# ==============================================================================
MIDDLEWARE: list[str] = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "core.middleware.ContentSecurityPolicyMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF: str = "config.urls"
WSGI_APPLICATION: str = "config.wsgi.application"
ASGI_APPLICATION: str = "config.asgi.application"

# ==============================================================================
# TEMPLATES (ARQUITETURA BASEADA EM COMPONENTES E PARCIAIS HTMX)
# ==============================================================================
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "core.context_processors.site_context",
            ],
        },
    },
]

# ==============================================================================
# BANCO DE DADOS (LEVE POR PADRÃO; SUPORTA DATABASE_URL QUANDO NECESSÁRIO)
# ==============================================================================
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default=f"sqlite:///{(BASE_DIR / 'db.sqlite3').as_posix()}",
    ),
}
DEFAULT_AUTO_FIELD: str = "django.db.models.BigAutoField"

# ==============================================================================
# CACHE (USADO PARA RATE LIMITING LEVE E DADOS INSTITUCIONAIS)
# ==============================================================================
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "rocha-plataforma-cache",
    },
}

# ==============================================================================
# SEGURANÇA DE CREDENCIAIS — ARGON2 COMO HASHER PRIMÁRIO
# ==============================================================================
PASSWORD_HASHERS: list[str] = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# ==============================================================================
# HARDENING BASE (APLICADO EM TODOS OS AMBIENTES)
# ==============================================================================
X_FRAME_OPTIONS: str = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF: bool = True
SECURE_REFERRER_POLICY: str = "strict-origin-when-cross-origin"
SESSION_COOKIE_HTTPONLY: bool = True
CSRF_COOKIE_HTTPONLY: bool = True
SESSION_COOKIE_SAMESITE: str = "Lax"
CSRF_COOKIE_SAMESITE: str = "Lax"

# Limites estritos contra exaustão de memória (DoS por payload grande)
DATA_UPLOAD_MAX_MEMORY_SIZE: int = 2_621_440  # 2.5 MB
FILE_UPLOAD_MAX_MEMORY_SIZE: int = 2_621_440  # 2.5 MB
DATA_UPLOAD_MAX_NUMBER_FIELDS: int = 50

# ==============================================================================
# INTERNACIONALIZAÇÃO & FUSO HORÁRIO (CEARÁ)
# ==============================================================================
LANGUAGE_CODE: str = "pt-br"
TIME_ZONE: str = "America/Fortaleza"
USE_I18N: bool = True
USE_TZ: bool = True

# ==============================================================================
# ARQUIVOS ESTÁTICOS GLOBAIS (ZERO-BLOAT CSS3 + JS MODULAR)
# ==============================================================================
STATIC_URL: str = "/static/"
STATIC_ROOT: Path = BASE_DIR / "staticfiles"
STATICFILES_DIRS: list[Path] = [
    BASE_DIR / "static",
]

# ==============================================================================
# DJANGO CRISPY FORMS + TAILWIND TEMPLATE PACK
# ==============================================================================
CRISPY_ALLOWED_TEMPLATE_PACKS: str = "tailwind"
CRISPY_TEMPLATE_PACK: str = "tailwind"

# ==============================================================================
# PARÂMETROS COMERCIAIS & SEGURANÇA OPERACIONAL DA MARCA ROCHA
# ==============================================================================
ENABLE_DJANGO_ADMIN: bool = env.bool("ENABLE_DJANGO_ADMIN", default=False)
DJANGO_ADMIN_URL: str = env("DJANGO_ADMIN_URL").lstrip("/")
if not DJANGO_ADMIN_URL.endswith("/"):
    DJANGO_ADMIN_URL = f"{DJANGO_ADMIN_URL}/"

ROCHA_WHATSAPP_CONSTRUTORA: str = "".join(
    ch for ch in env("ROCHA_WHATSAPP_CONSTRUTORA") if ch.isdigit()
)
ROCHA_WHATSAPP_LOCADORA: str = "".join(ch for ch in env("ROCHA_WHATSAPP_LOCADORA") if ch.isdigit())
RATE_LIMIT_REQUESTS_PER_MINUTE: int = env("RATE_LIMIT_REQUESTS_PER_MINUTE")
ENFORCE_FORM_TIMESTAMP: bool = env.bool("ENFORCE_FORM_TIMESTAMP", default=True)
FORM_MIN_SUBMIT_SECONDS: float = env.float("FORM_MIN_SUBMIT_SECONDS", default=1.2)
FORM_MAX_AGE_SECONDS: int = env.int("FORM_MAX_AGE_SECONDS", default=7200)
TRUSTED_PROXY_DEPTH: int = env.int("TRUSTED_PROXY_DEPTH", default=0)
CSP_UPGRADE_INSECURE_REQUESTS: bool = False
