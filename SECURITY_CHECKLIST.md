# SECURITY_CHECKLIST.md — Matriz de Segurança e Hardening (Landing Page + Vercel)

Controles obrigatórios de segurança defensiva e hardening para a plataforma **Rocha Construtora & Rocha Locações** em desenvolvimento e produção (Vercel).

---

## 1. Proteção CSRF + Integração HTMX

- [x] `CsrfViewMiddleware` ativo em todos os ambientes; proibido o uso de `@csrf_exempt`.
- [x] Em produção (`config/settings/production.py`):
  - `CSRF_COOKIE_SECURE = True`
  - `CSRF_COOKIE_HTTPONLY = True`
  - `CSRF_COOKIE_SAMESITE = "Lax"`
  - `CSRF_TRUSTED_ORIGINS` restrito aos domínios HTTPS oficiais e URLs de deploy da Vercel.
- [x] **Padrão HTMX Seguro**: Como `CSRF_COOKIE_HTTPONLY = True` bloqueia acesso via `document.cookie`, o token CSRF é injetado pelo servidor no `<body hx-headers='{"X-CSRFToken": "{{ csrf_token }}"}'>` em `templates/base.html`, além de `{% csrf_token %}` em todo `<form method="post">`.

---

## 2. Proteção Contra XSS e Injeção em Client-Side

- [x] Auto-escape nativo do Django ativo em 100% dos templates.
- [x] Proibição absoluta de `|safe`, `{% autoescape off %}` e `mark_safe` para entradas externas.
- [x] Parâmetros estruturados enviados para animações 3D/JS serializados exclusivamente com `{{ dados|json_script:"id" }}`.
- [x] Sanitização e codificação URL (`urllib.parse.quote`) no backend ao montar links externos de conversão para `https://wa.me/`, impedindo *Open Redirect* ou injeção de esquemas `javascript:`.

---

## 3. Proteção Contra SQL Injection e Manipulação de Filtros

- [x] Uso exclusivo do Django ORM parametrizado (quando houver banco) e validação por *whitelist* (`ChoiceField` / `TextChoices`) em `forms.py` para todos os parâmetros de busca/filtro `request.GET` (etapas da obra, faixas MCMV, categorias de equipamentos).
- [x] Proibição de `.extra()` ou interpolação de strings em SQL.

---

## 4. Clickjacking e Cabeçalhos de Isolamento

- [x] `X_FRAME_OPTIONS = "DENY"` + diretiva CSP `frame-ancestors 'none'`.
- [x] `SECURE_CONTENT_TYPE_NOSNIFF = True` (`X-Content-Type-Options: nosniff`).
- [x] `SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"`.
- [x] `Cross-Origin-Opener-Policy: same-origin`.
- [x] `Permissions-Policy` desativando APIs sensíveis do navegador (`camera=()`, `microphone=()`, `geolocation=()`, `payment=()`, `usb=()`).

---

## 5. Content Security Policy (CSP) Baseada em Nonce

- [x] `ContentSecurityPolicyMiddleware` (`core/middleware.py`) gerando `nonce` criptográfico único por requisição (`secrets.token_urlsafe(18)`).
- [x] Política estrita sem `'unsafe-inline'` nem `'unsafe-eval'` em `script-src`:
  - `default-src 'self'`
  - `script-src 'self' 'nonce-<request_nonce>' https://cdn.jsdelivr.net`
  - `style-src 'self' 'nonce-<request_nonce>' https://fonts.googleapis.com`
  - `font-src 'self' https://fonts.gstatic.com`
  - `img-src 'self' data: https:`
  - `connect-src 'self'`
  - `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  - `upgrade-insecure-requests` ativo em produção.

---

## 6. HSTS, TLS, Sessões e Argon2

- [x] `Argon2PasswordHasher` configurado como hasher primário em `base.py`.
- [x] Em `production.py`:
  - `DEBUG = False` fixo em código.
  - `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` (compatível com Edge TLS da Vercel).
  - `SECURE_SSL_REDIRECT = True`.
  - `SECURE_HSTS_SECONDS = 31536000`, `SECURE_HSTS_INCLUDE_SUBDOMAINS = True`, `SECURE_HSTS_PRELOAD = True`.
  - `SESSION_COOKIE_SECURE = True`, `SESSION_COOKIE_HTTPONLY = True`, `SESSION_COOKIE_SAMESITE = "Lax"`.
  - Rota do Django Admin customizável via `DJANGO_ADMIN_URL` (evitando `/admin/` padrão).

---

## 7. Anti-Automação, Limites de Payload e Minimização LGPD

- [x] Limite rígido de payload (`DATA_UPLOAD_MAX_MEMORY_SIZE = 2.5 MB`, `DATA_UPLOAD_MAX_NUMBER_FIELDS = 50`) contra ataques de exaustão de memória em funções serverless.
- [x] Formulários interativos (pré-simulador MCMV e orçamento de locação) protegidos no backend com validação estrita de tipos/limites, campo *Honeypot* anti-bot e Rate Limiting por IP (`HTTP 429`).
- [x] Minimização LGPD: coleta restrita apenas aos dados necessários para pré-enquadramento/orçamento instantâneo, sem retenção desnecessária de documentos sensíveis.
