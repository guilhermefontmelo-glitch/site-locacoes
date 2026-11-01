# SECURITY_CHECKLIST.md — Matriz de Segurança Zero-Trust (Landing Page + Vercel)

Controles obrigatórios de segurança defensiva e hardening para a plataforma **Rocha Construtora & Rocha Locações** em desenvolvimento, suíte de testes e produção serverless (Vercel).

---

## 1. Proteção CSRF, Hosts Explícitos & Integração HTMX

- [x] `CsrfViewMiddleware` ativo em todos os ambientes; proibido o uso de `@csrf_exempt`.
- [x] Em produção (`config/settings/production.py` + `config/settings/_validators.py`):
  - `CSRF_COOKIE_SECURE = True`
  - `CSRF_COOKIE_HTTPONLY = True`
  - `CSRF_COOKIE_SAMESITE = "Lax"`
  - **Zero Wildcard Vercel**: `.vercel.app` e `https://*.vercel.app` são bloqueados em `ImproperlyConfigured`. Apenas FQDNs RFC 1123 explícitos (`site-locacoes.vercel.app`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL` e domínios configurados) são aceitos.
- [x] **Padrão HTMX Seguro**: Como `CSRF_COOKIE_HTTPONLY = True` bloqueia acesso via `document.cookie`, o token CSRF é injetado pelo servidor em `<body hx-headers='{"X-CSRFToken": "{{ csrf_token }}"}'>` (`templates/base.html`) com `"selfRequestsOnly": true` e `"allowEval": false` em `htmx-config`, além de `{% csrf_token %}` em todo `<form method="post">`.

---

## 2. Proteção Contra XSS e Injeção Client-Side

- [x] Auto-escape nativo do Django ativo em 100% dos templates.
- [x] Proibição absoluta de `|safe`, `{% autoescape off %}` e `mark_safe`.
- [x] Dados estruturados enviados para o motor 3D/JS (`etapas-obra-json`) serializados exclusivamente via `{{ etapas_obra_payload|json_script:"etapas-obra-json" }}`.
- [x] Sanitização e codificação URL (`urllib.parse.quote`) em `core/security.py` (`build_whatsapp_url`) removendo caracteres de controle ASCII e travando o esquema em `https://wa.me/`.

---

## 3. Content Security Policy (CSP) Zero-CDN & Zero Inline Style

- [x] **100% Self-Hosted**: HTMX 2.0.4 (`static/vendor/htmx/htmx.min.js`), Three.js (`static/vendor/three/three.module.min.js`), fontes `.woff2` (`static/fonts/*.woff2`) e 40 ativos visuais `.avif`/`.webp` servidos na mesma origem, eliminando dependências externas (`unpkg.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, `images.unsplash.com`).
- [x] `ContentSecurityPolicyMiddleware` (`core/middleware.py`) gera `nonce` criptográfico único por requisição (`secrets.token_urlsafe(18)`):
  - `default-src 'none'`
  - `script-src 'self' 'nonce-<request_nonce>'`
  - `style-src 'self' 'nonce-<request_nonce>'`
  - `style-src-attr 'none'` (zero atributos `style=""` no HTML e zero mutações `element.style.*` no JS; animações exclusivamente via Web Animations API em `static/js/modules/waapi-driver.js`)
  - `img-src 'self' data: blob:`
  - `font-src 'self'`
  - `connect-src 'self'`
  - `worker-src 'self' blob:; manifest-src 'self'`
  - `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
  - `upgrade-insecure-requests` ativo em produção.

---

## 4. Isolamento Cross-Origin e Cabeçalhos HTTP

- [x] `X_FRAME_OPTIONS = "DENY"` + `frame-ancestors 'none'`.
- [x] `SECURE_CONTENT_TYPE_NOSNIFF = True` (`X-Content-Type-Options: nosniff`).
- [x] `SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"`.
- [x] `Cross-Origin-Opener-Policy: same-origin`.
- [x] `Cross-Origin-Resource-Policy: same-origin`.
- [x] `X-Permitted-Cross-Domain-Policies: none`.
- [x] `Permissions-Policy` restritiva para 22 APIs sensíveis (`camera=()`, `microphone=()`, `geolocation=()`, `payment=()`, `usb=()`, `browsing-topics=()`, etc.).
- [x] Prevenção de *Cache Poisoning* entre SSR e parciais HTMX via `@htmx_vary_response` (`Vary: HX-Request, Accept-Encoding` + `Cache-Control: private, no-cache, must-revalidate`).

---

## 5. HSTS, TLS, Sessões Serverless e Superfície Admin Oculta

- [x] `Argon2PasswordHasher` configurado como hasher primário em `config/settings/base.py`.
- [x] Em `config/settings/production.py`:
  - `DEBUG = False` fixo em código.
  - `ENABLE_DJANGO_ADMIN = False` por padrão (`config/urls.py` não registra a rota admin na URLConf pública salvo ativação explícita).
  - `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`.
  - `SECURE_SSL_REDIRECT = True`.
  - `SECURE_HSTS_SECONDS = 31536000`, `SECURE_HSTS_INCLUDE_SUBDOMAINS = True`, `SECURE_HSTS_PRELOAD = True`.
  - `SESSION_COOKIE_SECURE = True`, `SESSION_COOKIE_HTTPONLY = True`, `SESSION_COOKIE_SAMESITE = "Lax"`.

---

## 6. Anti-Automação Criptográfica, Rate Limiting HMAC e LGPD

- [x] **Extração Anti-Spoofing de IP (`core/throttling.py`)**: Prioriza `HTTP_X_VERCEL_FORWARDED_FOR` injetado pela borda Vercel e ignora `X-Forwarded-For` falsificável quando `TRUSTED_PROXY_DEPTH = 0`.
- [x] **Pseudonimização LGPD em Memória**: Chaves de Rate Limiting derivadas com `HMAC-SHA256(SECRET_KEY, f"{scope}:{ip}")`, sem armazenar IPs puros no cache.
- [x] **Respostas HTTP 429 Inteligentes**: Header obrigatório `Retry-After` e parcial acessível `templates/errors/partials/_rate_limit_429.html` para requisições `HX-Request: true`.
- [x] **Anti-Bot Duplo (`core/security.py` + `templates/components/_crispy_form.html`)**:
  - Dois campos Honeypot (`website` e `website_url_trap`) fora de alcance de leitores de tela (`aria-hidden="true"`, `tabindex="-1"`).
  - Token temporal assinado via `django.core.signing.TimestampSigner` rejeitando submissões automatizadas (`< 1.2s`), expiradas (`> 7200s`) ou adulteradas com descarte silencioso `HTTP 204`.
