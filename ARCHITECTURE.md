# ARCHITECTURE.md — Arquitetura da Landing Page Rocha Construtora & Locações

## 1. Visão Geral e Posicionamento Arquitetural

Esta aplicação é uma **Landing Page Interativa e Dinâmica de Alta Conversão** (arquitetura enxuta **Zero-ERP**), hospedada na **Vercel**, projetada para a **Rocha Construtora** (Viçosa do Ceará - CE e região).

O ecossistema unifica duas frentes sob a **mesma marca, identidade visual e infraestrutura**, guiando o visitante diretamente ao fechamento/atendimento via WhatsApp:

1. **`apps/construtora` (Construtora & Financiamento Caixa / Minha Casa Minha Vida)**:
   - Experiência visual imersiva com animações 3D e coreografia de rolagem (*scroll-driven storytelling*) exibindo as **etapas da obra** (Fundação → Estrutura → Alvenaria → Cobertura & Instalações → Acabamento → Entrega das Chaves).
   - Jornada explicativa e **pré-simulador interativo (HTMX + Crispy Forms)** do processo de financiamento **Caixa Habitacional / Minha Casa Minha Vida (MCMV)** (aquisição de terreno + construção ou construção em terreno próprio).
   - Vitrine enxuta de obras/diferenciais construtivos e CTAs diretos de alta conversão.

2. **`apps/locadora` (Área da Locadora de Equipamentos para Construção Civil)**:
   - Landing page integrada com a mesma assinatura visual da Rocha Construtora.
   - Catálogo interativo de andaimes, escoras, betoneiras, compactadores e ferramentas, filtrável instantaneamente via HTMX por categoria ou **etapa da obra**.
   - Passo a passo simplificado (*Orçamento → Entrega na Obra → Retirada*) e formulário/cesta estilizado com Crispy Forms + Tailwind que gera mensagem estruturada e validada no backend para atendimento imediato no WhatsApp.

---

## 2. Estrutura de Diretórios Consolidada (DRY, Enxuta & Serverless-Ready)

```text
site-locacoes/
├── .vscode/
│   └── settings.json                 # Ruff (Python) + djLint (Django HTML) + .venv
├── config/
│   ├── __init__.py
│   ├── asgi.py                       # Entrypoint ASGI
│   ├── wsgi.py                       # Entrypoint WSGI (auto-detecta Vercel -> production)
│   ├── urls.py                       # Rotas principais (/ para Construtora, /locadora/ para Locadora)
│   └── settings/
│       ├── __init__.py
│       ├── base.py                   # Base compartilhada, Argon2, Crispy Tailwind, Middlewares
│       ├── local.py                  # DEBUG=True, Debug Toolbar, auditoria local
│       ├── production.py             # Hardening total + compatibilidade nativa Vercel + WhiteNoise
│       └── test.py                   # Suíte rápida pytest
├── core/                             # Camada transversal de segurança, performance e utilitários
│   ├── __init__.py
│   ├── apps.py
│   ├── context_processors.py         # Nonce CSP + metadados institucionais globais da marca Rocha
│   ├── middleware.py                 # Content-Security-Policy (Nonce), Permissions-Policy, COOP
│   ├── security.py                   # Honeypot anti-bot e assinatura temporal de formulários
│   ├── throttling.py                 # Rate limiting leve em cache para endpoints POST públicos
│   ├── validators.py                 # Sanitização de entradas, validação de telefone BR e valores
│   └── views.py                      # Endpoint /healthz/ e páginas de erro seguras (400/403/404/429/500)
├── apps/                             # Apenas 2 domínios enxutos orientados a conversão
│   ├── __init__.py
│   ├── construtora/                  # Obras + Cena 3D das Etapas + Jornada/Simulador Caixa MCMV
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   ├── forms.py                  # Formulários validados no backend e renderizados via Crispy Tailwind
│   │   ├── models.py                 # Modelos enxutos (se aplicável) sem sobrecarga de ERP
│   │   ├── selectors.py              # Leitura otimizada de etapas da obra, faixas MCMV e portfólio
│   │   ├── services.py               # Cálculo seguro de pré-enquadramento MCMV + geração link WhatsApp
│   │   ├── urls.py
│   │   ├── views.py                  # Views SSR + fragmentos parciais HTMX
│   │   └── tests/
│   └── locadora/                     # Área de Locação de Equipamentos para Construção Civil
│       ├── __init__.py
│       ├── apps.py
│       ├── forms.py                  # Validação backend de filtros de catálogo e pedido de orçamento
│       ├── models.py                 # Modelos enxutos de catálogo (ou dados tipados imutáveis)
│       ├── selectors.py              # Filtragem rápida por categoria e etapa da obra
│       ├── services.py               # Montagem validada de orçamento multi-equipamento -> WhatsApp
│       ├── urls.py
│       ├── views.py                  # Views SSR + filtros/modais/orçamento parciais HTMX
│       └── tests/
├── src/
│   └── input.css                     # Fonte do Tailwind CSS v4 (@theme Rocha + @source templates/crispy)
├── templates/
│   ├── base.html                     # Estrutura global DRY (Fontes, Tailwind + main.css, CSP Nonce, HTMX)
│   ├── partials/
│   │   ├── _header.html              # Topo fixo glassmorphism + Heroicons + switcher Construtora <-> Locadora
│   │   └── _footer.html              # Rodapé institucional unificado Viçosa do Ceará - CE
│   ├── components/                   # Componentes atômicos isolados ({% include ... only %})
│   │   ├── _icon.html                # Biblioteca Heroicons v2 em SVG inline otimizado (Zero-Bloat)
│   │   ├── _image.html               # Componente de imagem responsiva otimizada (anti-CLS, lazy/LCP)
│   │   └── _crispy_form.html         # Envelope padrão HTMX + CSRF + Honeypot + {{ form|crispy }}
│   ├── pages/
│   │   ├── construtora/              # Landing principal (3D, Etapas, Financiamento MCMV) + parciais HTMX
│   │   └── locadora/                 # Landing da Locadora (Catálogo, Como Alugar, Cotação) + parciais HTMX
│   └── errors/                       # 400.html, 403.html, 404.html, 429.html, 500.html
├── static/
│   ├── css/
│   │   ├── tailwind.css              # Bundle utilitário minificado compilado pelo Tailwind CSS v4 CLI
│   │   ├── main.css                  # Design Tokens Dark/Light, harmonização Crispy Forms e animações 3D/GPU
│   │   └── pages/                    # Estilos específicos sob demanda (construtora.css, locadora.css)
│   ├── js/
│   │   └── modules/
│   │       ├── app.js                # Bootstrap ES6+: menu acessível, tema Dark/Light, barra scroll, <dialog>
│   │       ├── scene3d-obra.js       # Animação 3D interativa das etapas da obra acelerada por GPU
│   │       └── scroll-choreography.js# Coreografia de rolagem 60fps via IntersectionObserver + rAF
│   └── img/                          # Ativos visuais otimizados da marca, obras e equipamentos
├── requirements/
│   ├── base.txt                      # Django, Argon2, Environ, WhiteNoise, Crispy Forms + Crispy Tailwind
│   ├── local.txt                     # Ferramentas de dev, lint e inspeção
│   └── production.txt                # Runtime de produção
├── package.json                      # Scripts npm css:dev / css:build do Tailwind CSS v4 CLI
├── requirements.txt                  # Entrada automática do builder Python da Vercel
├── vercel.json                       # Configuração Serverless da Vercel apontando para config/wsgi.py
├── manage.py
├── pyproject.toml
├── .env.example
├── AI_RULES.md
├── ARCHITECTURE.md
└── SECURITY_CHECKLIST.md
```

---

## 3. Pilares Visuais & Frontend (`site-bonito.md` + Alta Performance)

1. **Tailwind CSS v4 + CSS3 `@layer` Unificados**:
   - `src/input.css` define os tokens `@theme` da Rocha Construtora e rastreia automaticamente `templates/`, `apps/` e os templates internos do `crispy_tailwind`, gerando `static/css/tailwind.css` minificado.
   - `static/css/main.css` opera nas mesmas camadas (`@layer theme, base, components, animations, utilities;`), adicionando suporte nativo Dark/Light, estilização refinada dos campos do `django-crispy-forms`, Container Queries e primitivas 3D/GPU.
2. **Formulários Turbinados (`django-crispy-forms` + `crispy-tailwind`)**:
   - Elimina completamente HTML bruto (`form.as_p`), unindo validação rigorosa no backend com renderização elegante `{{ form|crispy }}` e submissão sem reload via HTMX.
3. **Tipografia Editorial, Heroicons SVG e Imagens Otimizadas**:
   - Par tipográfico `Outfit` (títulos e números) + `Plus Jakarta Sans` (interface e leitura) + `Playfair Display` (destaques nobres).
   - Biblioteca `components/_icon.html` baseada em **Heroicons v2** (vetores puros sem requisições extras de fontes e 100% aderentes à nossa CSP).
   - Componente `components/_image.html` garantindo carregamento rápido (`loading="lazy"`, `decoding="async"`, dimensões explícitas contra *Layout Shift*).
