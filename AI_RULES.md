# AI_RULES.md — Diretrizes Inegociáveis de Engenharia, Design e Governança

Este documento define o contrato técnico obrigatório para qualquer código gerado ou modificado neste repositório (**Rocha Construtora & Rocha Locações**).

> **ESCOPO ARQUITETURAL (LANDING PAGE INTERATIVA — ZERO ERP)**:
> O projeto consiste em uma **Landing Page Institucional e Comercial de Alta Conversão** (e não um sistema ERP/CRM pesado), hospedada na **Vercel**, composta por apenas duas verticais de negócio enxutas:
> 1. `apps/construtora`: Experiência interativa 3D/scroll das etapas da obra + jornada e pré-simulação do financiamento **Caixa Habitacional / Minha Casa Minha Vida (MCMV)** + portfólio enxuto + conversão para WhatsApp.
> 2. `apps/locadora`: Área da locadora de equipamentos para construção civil (mesma marca e objetivos de conversão), com catálogo filtrável e montagem rápida de pedido de orçamento para WhatsApp.
> É **proibido** introduzir complexidade de ERP (painéis administrativos inchados, fluxos financeiros internos, estoque complexo ou apps satélites desnecessários).

Todas as decisões devem priorizar: **1. Segurança (Security-by-Design)**, **2. Desempenho (Zero-Bloat & Low-Latency)** e **3. Design Impecável, Interatividade & UX (Tailwind CSS v4 + CSS3 3D + Crispy Forms + Heroicons + HTMX)**.

---

## 1. Padrões de Escrita de Código Python

1. **Conformidade PEP 8 e Linting Automatizado**:
   - Todo código Python deve passar sem avisos pelo **Ruff** (substituindo Flake8, Black, isort e Bandit).
   - Limite de linha: **100 caracteres**. Aspas duplas padronizadas.
   - Imports ordenados em três blocos estritos: `stdlib`, terceiros (`django`, `crispy_forms`) e módulos internos (`config`, `core`, `apps`). Imports relativos profundos (`..`) são proibidos; use imports absolutos (`from apps.construtora.services import ...`).

2. **Type Hints Obrigatórios**:
   - **100% das funções, métodos, `services`, `selectors` e `views`** devem possuir anotações explícitas de tipos nos parâmetros e no retorno (sintaxe Python 3.12+: `list[str]`, `dict[str, str]`, `str | None`).
   - Views devem tipar explicitamente `request: HttpRequest` e retornar `HttpResponse`.

3. **Docstrings Claras e Objetivas**:
   - Módulos, classes públicas, `services` e `selectors` devem conter Docstrings concisas (padrão Google/PEP 257) descrevendo intenção, argumentos e retorno.

---

## 2. Configuração Modular e Gestão de Segredos

1. **Proibição de `settings.py` Monolítico**:
   - É **estritamente proibido** manter configurações em um `config/settings.py` monolítico.
   - Toda configuração reside em `config/settings/` dividida em `base.py`, `local.py`, `production.py` e `test.py`.

2. **Zero Segredos Hardcoded**:
   - É **proibido** declarar `SECRET_KEY`, tokens ou credenciais hardcoded no código.
   - Em `production.py`, a ausência de `DJANGO_SECRET_KEY` válida aborta a inicialização imediatamente (*Fail-Fast*).

---

## 3. Governança do Django ORM e Dados (Zero N+1 & Serverless-Ready)

1. **Auditoria Obrigatória Contra N+1 Queries**:
   - Sempre que o Django ORM for utilizado, toda query deve ser auditada contra *N+1 queries*.
   - Relações `ForeignKey` / `OneToOneField` exigem `select_related()`.
   - Relações `ManyToManyField` / reversas exigem `prefetch_related()` (ou `Prefetch()`).
   - É proibido disparar queries dentro de loops Python ou diretamente em templates Django.

2. **Leveza para Landing Page em Ambiente Serverless (Vercel)**:
   - Priorize estruturas de dados enxutas e leitura ultrarrápida em `selectors.py` (com cache em memória de processo ou catálogos tipados imutáveis via `@dataclass(frozen=True)` quando não houver necessidade de escrita transacional em banco).
   - Caso haja persistência em banco, utilize paginação/limites explícitos e projeção enxuta (`.only()`).

---

## 4. Arquitetura em Camadas Enxutas (Service Layer & Selectors)

1. **Views Enxutas (`views.py`)**:
   - Views atuam apenas como adaptadores HTTP/Hypermedia: validam entrada via `forms.py`, consultam `selectors.py` ou executam regras em `services.py`, e renderizam página completa ou fragmento parcial HTMX (`HX-Request`).

2. **Isolamento em `services.py` e `selectors.py`**:
   - **`selectors.py`**: Consultas e filtragens puras (ex: filtrar etapas da obra, faixas MCMV ou equipamentos por categoria/etapa), sem efeitos colaterais.
   - **`services.py`**: Cálculos e regras de negócio (ex: pré-simulação ilustrativa MCMV com `decimal.Decimal` — jamais `float` — e formatação sanitizada da mensagem comercial para WhatsApp), exigindo *keyword-only arguments* (`def simular_financiamento(*, renda_familiar: Decimal, ...) -> ResultadoSimulacao:`).

---

## 5. Validação Estrita no Backend & Formulários com Crispy Forms

1. **Validação Servidor Obrigatória (Zero-Trust no Cliente)**:
   - Todo formulário interativo (pré-análise Caixa/MCMV, contato da construtora, calculadora/cesta de orçamento de locação) e todo filtro `GET` deve ser estritamente validado e sanitizado no backend (`forms.py` + validadores de `core/`).
   - Atributos HTML5 e feedback em tempo real via HTMX são exclusivos para UX — nunca substituem a validação no backend.

2. **Padronização Visual com Django Crispy Forms (`crispy-tailwind`)**:
   - É **proibido** renderizar formulários brutos do Django (`{{ form }}`, `{{ form.as_p }}`, `{{ form.as_table }}`).
   - Todo formulário deve ser renderizado utilizando `{% load crispy_forms_tags %}` com `{{ form|crispy }}` (ou via o componente reutilizável `templates/components/_crispy_form.html`), garantindo acessibilidade, feedback visual de erros e harmonia estética com o tema da Rocha Construtora.

---

## 6. Padrões de Frontend, Design System & Interatividade

1. **HTML5 Semântico, DRY, Acessível e Seguro**:
   - Estrutura estritamente DRY apoiada em herança de `templates/base.html` (`{% block content %}`) e componentes isolados com `{% include "components/_nome.html" with ... only %}`.
   - Uso rigoroso de `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>` e `<dialog>`, atributos ARIA coerentes, navegação completa por teclado e contraste WCAG AA.
   - Proibido usar `|safe`, `{% autoescape off %}` ou `mark_safe()` em entradas dinâmicas. Dados enviados ao JS (ex: cena 3D) devem usar `{{ dados|json_script:"id" }}`.

2. **Tailwind CSS v4 (Compilado Zero-Bloat) + CSS3 Moderno (`main.css`)**:
   - **Tailwind CSS v4 CLI** (`src/input.css` → `static/css/tailwind.css`) gera exclusivamente os utilitários utilizados nos templates e no `crispy-tailwind` (zero runtime JS, CSS minificado de poucos kilobytes).
   - **`static/css/main.css`** compartilha a mesma hierarquia `@layer theme, base, components, animations, utilities;` para Design Tokens (`:root` Dark/Light mode), tipografia fluida `clamp()`, Container Queries (`@container`) e palco de animações 3D/scroll.
   - Animações 3D, de rolagem (*scroll-driven*) e micro-interações restritas a propriedades aceleradas por GPU (`transform`, `opacity`), com suporte obrigatório a `@media (prefers-reduced-motion: reduce)` e *View Transitions API*.

3. **Detalhes Visuais de Alto Padrão (Tipografia, Heroicons & Imagens Otimizadas)**:
   - **Tipografia**: Combinação editorial moderna via Google Fonts (`Outfit` para títulos arquitetônicos/números, `Plus Jakarta Sans` para leitura fluida de interface e `Playfair Display` para destaques institucionais).
   - **Ícones**: Uso padronizado de **Heroicons v2 em SVG otimizado** através do componente `templates/components/_icon.html` (zero fontes pesadas de terceiros, zero CLS e 100% compatível com CSP).
   - **Imagens**: Uso de imagens de alta qualidade otimizadas (preferencialmente WebP/AVIF ou URLs otimizadas com dimensões controladas) via `templates/components/_image.html`, exigindo `width` e `height` explícitos, `fetchpriority="high"` apenas na dobra principal (LCP) e `loading="lazy"` + `decoding="async"` nas demais seções.

4. **HTMX + Vanilla JS Modular (ES6+)**:
   - **HTMX** para todas as interações assíncronas fluidas sem reload (filtros de equipamentos em tempo real, etapas do pré-simulador MCMV, submissão de formulários `{{ form|crispy }}` e modais `<dialog>`).
   - **JavaScript Vanilla ES6+ modular** restrito ao estritamente necessário (coreografia 3D sincronizada ao scroll em `requestAnimationFrame` + `IntersectionObserver`, controle de `<dialog>` e tema), sem `eval()` nem `onclick` inline, respeitando CSP com `nonce`.
