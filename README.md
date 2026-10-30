# Rocha Construtora & Rocha Locações — Plataforma Institucional Interativa

Landing Page dinâmica de alta conversão desenvolvida com **Python 3.12 + Django 6.1**, **Tailwind CSS v4 + CSS3 3D Moderno**, **Django Crispy Forms**, **Heroicons SVG** e **HTMX 2**, hospedada na **Vercel**.

A plataforma unifica duas frentes sob a mesma identidade de marca em **Viçosa do Ceará - CE e Serra da Ibiapaba**:
1. **Rocha Construtora (`/`)**: Maquete arquitetônica isométrica 3D sincronizada ao scroll com as **6 etapas da obra**, passo a passo do financiamento **Caixa Habitacional / Minha Casa Minha Vida (MCMV)**, pré-simulador interativo e conversão direta para WhatsApp.
2. **Rocha Locações (`/locadora/`)**: Catálogo técnico de andaimes, escoras, betoneiras, guinchos e ferramentas elétricas com filtragem em tempo real via HTMX, ficha técnica em `<dialog>` nativo e montador de lista de orçamento para WhatsApp.

---

## Governança & Arquitetura

- [`AI_RULES.md`](./AI_RULES.md): Regras estritas de código (PEP 8, Type Hints, Crispy Forms, Zero N+1 e animações GPU).
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): Estrutura modular (`config/settings/`, `core/`, `apps/construtora/`, `apps/locadora/`) e padrão Service Layer + Selectors.
- [`SECURITY_CHECKLIST.md`](./SECURITY_CHECKLIST.md): Hardening de produção (Argon2, CSP com Nonce criptográfico, HSTS, Cookies `HttpOnly`/`Secure`, Honeypot e Rate Limit).

---

## Como Executar Localmente (Windows PowerShell)

### Windows — mais rápido
Dê **duplo clique em `iniciar.cmd`**. Ele cria o ambiente virtual se necessário,
ativa, instala as dependências e sobe o servidor.

### Manual
```powershell
# 1. Criar ambiente virtual (caso ainda não exista) e instalar dependências de desenvolvimento
python -m venv .venv
.\.venv\Scripts\pip install -r requirements/local.txt

# 2. Copiar arquivo de variáveis de ambiente locais
Copy-Item .env.example .env
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py runserver
```

> Se aparecer erro de política de execução no `Activate.ps1`, use:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

No VS Code o ambiente ativa sozinho ao abrir o terminal (`.vscode/settings.json`).

## CSS (Tailwind)

# 3. Compilar utilitários do Tailwind CSS v4 (ou usar css:dev em modo watch)
npm install
npm run css:build

# 4. Iniciar o servidor local (usa config.settings.local por padrão)
.\.venv\Scripts\python manage.py runserver
```

Acesse:
- **Construtora & Financiamento Caixa/MCMV**: `http://127.0.0.1:8000/`
- **Locadora de Equipamentos**: `http://127.0.0.1:8000/locadora/`
- **Healthcheck**: `http://127.0.0.1:8000/healthz/`

---

## Qualidade de Código & Testes

```powershell
# Linter e Formatter Python ultrarrápido (Ruff)
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .

# Linter de Templates Django + HTML5 (djLint)
.\.venv\Scripts\djlint templates/ --lint

# Suíte de Testes Automatizados (Pytest)
.\.venv\Scripts\pytest
```

---

## Deploy na Vercel

O projeto detecta automaticamente `VERCEL=1` em `config/wsgi.py` e `manage.py`, ativando `config.settings.production` com **WhiteNoise + Brotli** e sessões serverless-safe.

1. No painel da Vercel (*Project Settings → Environment Variables*), configure:
   - `DJANGO_SECRET_KEY`: chave gerada com `python -c "import secrets; print(secrets.token_urlsafe(64))"`
   - *(Opcional)* `DJANGO_ALLOWED_HOSTS` e `DJANGO_CSRF_TRUSTED_ORIGINS` ao conectar domínio próprio.
2. Antes de enviar alterações de classes Tailwind:
   ```powershell
   npm run css:build
   git add -A
   git commit -m "feat: nova landing page interativa construtora e locadora"
   git push
   ```
