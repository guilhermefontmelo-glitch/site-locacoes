# ARCHITECTURE.md — Arquitetura da Plataforma Rocha Construtora & Rocha Locações

## 1. Visão Geral e Posicionamento Arquitetural (`Zero-ERP`)

Aplicação web institucional e interativa de alta conversão (**Zero-ERP**), projetada para execução serverless na **Vercel** (Python 3.12 + Django 6.1 + HTMX 2.0.4 + Tailwind CSS v4 + Three.js WebGL), unificando duas verticais de negócio em Viçosa do Ceará - CE sob o mesmo sistema de design:

1. **`apps/construtora` (Rocha Construtora — Obras Financiadas Caixa & Minha Casa Minha Vida)**:
   - Palco arquitetônico 3D com *scroll-pinning* (`01..06`, pista `.obra-scroll-runway` + `.obra-pinned-viewport`), alternância entre **Holograma CAD** (`EdgesGeometry` + plano de varredura laser) e **Modo Realista PBR**, vista explodida omnidirecional `(dx, dy, dz)` em 18 subgrupos construtivos e sincronia em memória (`json_script` `#etapas-obra-json`).
   - Simulador Habitacional interativo de 2 colunas com matemática **100% `decimal.Decimal`** (`ROUND_HALF_UP`), comparando sistemas **`SAC`** e **`PRICE`**, Faixas 1, 2 e 3 do programa Minha Casa Minha Vida Regional Nordeste + linha Caixa SBPE, teto LTV (`70%`, `80%` ou `90%` em lote próprio), subsídio estimado, máscara BRL e sliders progressivos sincronizados.

2. **`apps/locadora` (Rocha Locações — Equipamentos para Construção Civil)**:
   - Catálogo operacional com 8 famílias de equipamentos fotografados em proporção editorial (`AVIF` + `WebP`), filtragem instantânea via HTMX com barra horizontal `scroll-snap` em mobile, modal `<dialog>` nativo acessível e montagem de orçamento multi-equipamento convertendo diretamente para o WhatsApp.

---

## 2. Estrutura de Diretórios Consolidada

```text
site-locacoes/
├── .stitch/
│   └── DESIGN.md                         # Design System semântico canônico (Dark/Light, tokens, anti-patterns)
├── config/
│   ├── asgi.py                           # Entrypoint ASGI
│   ├── wsgi.py                           # Entrypoint WSGI serverless (Vercel)
│   ├── urls.py                           # Roteamento raiz (/, /locadora/, /healthz/ e admin condicional)
│   └── settings/
│       ├── _validators.py                # Validação RFC 1123 sem wildcards para hosts e origens CSRF
│       ├── base.py                       # Configuração base compartilhada, Argon2, Crispy Tailwind
│       ├── local.py                      # Desenvolvimento local
│       ├── production.py                 # Hardening Zero-Trust + WhiteNoise Manifest/Brotli + Vercel
│       └── test.py                       # Suíte rápida pytest em SQLite :memory:
├── core/
│   ├── context_processors.py             # Nonce CSP, metadados Rocha e gerador de token anti-bot
│   ├── http.py                           # @htmx_vary_response (Vary: HX-Request + Cache-Control privado)
│   ├── middleware.py                     # CSP Zero-CDN (default-src 'none', style-src-attr 'none'), COOP/CORP
│   ├── security.py                       # TimestampSigner (1.2s..7200s), Honeypots duplos e WhatsApp URL
│   ├── throttling.py                     # Rate limiting com IP real Vercel, HMAC-SHA256 e 429 HTMX
│   ├── validators.py                     # Sanitização textual e validação de telefone brasileiro
│   ├── views.py                          # /healthz/ e handlers de erro 400/403/404/429/500
│   └── tests/
│       └── test_security_and_headers.py  # Testes unitários e de integração de segurança Zero-Trust
├── apps/
│   ├── construtora/                      # Domínio Rocha Construtora (selectors, forms, services Decimal, views)
│   └── locadora/                         # Domínio Rocha Locações (selectors, forms, services, views)
├── src/
│   └── input.css                         # Entrada do Tailwind CSS v4 CLI
├── templates/
│   ├── base.html                         # Shell HTML5 sem CDN externa, fontes preload e manifesto data-*
│   ├── partials/                         # _header.html (desktop switcher + .mobile-unit-bar) e _footer.html
│   ├── components/                       # _icon.html, _image.html (<picture> AVIF/WebP), _crispy_form.html
│   ├── pages/
│   │   ├── construtora/                  # home.html + parciais (_simulador_workspace, _etapa_painel, etc.)
│   │   └── locadora/                     # catalogo.html + parciais (_grid_equipamentos, _modal_equipamento, etc.)
│   └── errors/                           # Páginas de erro + partials/_rate_limit_429.html
└── static/
    ├── fonts/                            # Outfit, Plus Jakarta Sans e Playfair Display (.woff2 locais)
    ├── vendor/                           # HTMX 2.0.4 e Three.js ES Module auto-hospedados
    ├── css/                              # tailwind.css, main.css e pages/{construtora,locadora}.css
    ├── img/                              # Logos + 20 ativos contextuais em pares .avif e .webp (40 arquivos)
    └── js/modules/
        ├── waapi-driver.js               # Motor Web Animations API compositor-only (zero inline style)
        ├── scroll-choreography.js        # Tipografia cinética acessível, stagger, contadores e timelines
        ├── simulator-ui.js               # Máscara BRL, sliders progressivos, presets de prazo e reset
        ├── scene3d-obra.js               # Scroll-pinning 01..06, painel em memória e lazy import WebGL
        ├── scene3d-three.js              # Cena Three.js CAD/PBR, 18 subgrupos explodíveis e dispose GPU
        └── app.js                        # Bootstrap SPA entre unidades, tema Dark/Light e ciclo de vida
```

---

## 3. Decisões Arquiteturais Chave

1. **Compatibilidade Total com `style-src-attr 'none'` (`waapi-driver.js`)**:
   - Nenhuma animação ou controle interativo muta `element.style.*` nem invoca `Animation.commitStyles()`. Barras de progresso, inclinação 3D, varredura laser e explosão CSS 3D operam diretamente na pilha de composição via `KeyframeEffect` e `Element.animate()`.
2. **Code-Splitting Estrito por Vertical**:
   - Visitantes que acessam `/locadora/` baixam apenas `locadora.css` e os módulos globais leves (`app.js`, `scroll-choreography.js`, `waapi-driver.js`). Ao alternar para a Construtora via transição SPA, `app.js` injeta `construtora.css` e importa `scene3d-obra.js` e `simulator-ui.js` sob demanda; ao retornar para a Locadora, `disposeObraStageUI()` libera integralmente geometrias, materiais, texturas, `PMREMGenerator` e contexto WebGL.
3. **Pipeline `<picture>` AVIF + WebP com Prioridade Cirúrgica de LCP**:
   - Apenas a imagem Hero principal de cada página recebe `fetchpriority="high" loading="eager" decoding="sync"`, enquanto os demais 19 ativos utilizam `loading="lazy" decoding="async"` com `width`/`height` explícitos (`CLS = 0`).
