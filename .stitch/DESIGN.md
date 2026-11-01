# Rocha Construtora & Rocha Locações — Design System (`DESIGN.md`)

## 1. Visual Theme & Brand Architecture
**Aesthetic Direction**: *Architectural Dark Blueprint & Solar High-Contrast Field Engineering*.
**Dual-Vertical Cohesion**:
- **Rocha Construtora** (`/`) and **Rocha Locações** (`/locadora/`) share 100% of foundational surfaces, typography, spacing, motion curves, and structural tokens (`@layer properties, theme, base, components, animations, utilities`).
- Distinction is communicated through editorial accent hierarchy:
  - **Construtora**: Architectural Gold (`--color-gold-500`) + Caixa Blueprint Cyan (`--color-caixa-accent`) for CAD holographic inspection and housing finance clarity.
  - **Locadora**: Architectural Gold (`--color-gold-500`) + Field Safety Contrast for operational equipment readiness and instant WhatsApp quotation.

---

## 2. Calibrated Color Palette & Semantic Tokens

### Dark Mode Default (`:root` / `[data-theme="dark"]`)
| Semantic Token | Value | Role & Contrast |
| :--- | :--- | :--- |
| `--color-bg-canvas` | `#0b1320` | Primary architectural slate-navy canvas |
| `--color-bg-surface` | `#111e33` | Cards, panels, sticky toolbars, modals |
| `--color-bg-elevated` | `#172844` | Active steps, hover surfaces, framed media |
| `--color-bg-glass` | `rgba(11, 19, 32, 0.86)` | Fixed header & mobile switcher bar (`backdrop-filter: blur(12px)`) |
| `--color-gold-300`..`700` | `#ebd3a2` / `#e2c58a` / `#c9a45c` / `#a8843e` / `#8c6b2c` | Primary brand gold ramp |
| `--color-gold-text` | `#e2c58a` | Gold text accent (`>= 8.9:1` on `#0b1320`) |
| `--color-text-primary` | `#f8fafc` | Primary headings & body lead (`>= 16.4:1`) |
| `--color-text-secondary` | `#cbd5e1` | Body copy (`>= 11.2:1`) |
| `--color-text-muted` | `#94a3b8` | Metadata, helper labels (`>= 6.1:1`, WCAG AA+) |
| `--color-caixa-accent` | `#38bdf8` | CAD hologram edges, Caixa badges, laser scanline |
| `--color-whatsapp` | `#22c55e` | Conversion CTA surface (`#052e16` text on dark) |

### Sunlight Field Mode (`:root[data-theme="light"]` — WCAG AAA Calibrated)
| Semantic Token | Value | Role & Contrast |
| :--- | :--- | :--- |
| `--color-bg-canvas` | `#f2f4f8` | Glare-free daylight mineral canvas |
| `--color-bg-surface` | `#ffffff` | Crisp technical sheet surface |
| `--color-bg-elevated` | `#e5e9f1` | Secondary elevation & active state |
| `--color-gold-500` | `#8b6219` | Deep bronze-gold primary (`#ffffff` on-gold text) |
| `--color-gold-text` | `#68470c` | High-contrast bronze text (`>= 7.4:1` on `#ffffff`, WCAG AAA) |
| `--color-text-primary` | `#091220` | Ink-navy headings (`>= 17.8:1`) |
| `--color-text-secondary` | `#1e2d44` | Body copy (`>= 12.6:1`) |
| `--color-text-muted` | `#3b4d68` | Supporting labels (`>= 7.5:1`, WCAG AAA) |
| `--color-caixa-accent` | `#075985` | Deep engineering cyan (`>= 7.1:1` on light) |
| `--color-whatsapp` | `#15803d` | Field-ready WhatsApp CTA (`#ffffff` text) |

---

## 3. Typography & Self-Hosted Font Stack
All fonts are self-hosted in `static/fonts/*.woff2` (`font-display: swap`, zero external Google Fonts requests):
- **Display & Headings (`--font-heading`)**: `"Outfit"` (`500..800`), `line-height: 1.08`, `letter-spacing: -0.025em`, `text-wrap: balance`.
- **Body & Forms (`--font-sans`)**: `"Plus Jakarta Sans"` (`400..700`), `line-height: 1.6`, `text-wrap: pretty`, `tabular-nums` on financial KPIs.
- **Editorial Accent (`--font-serif`)**: `"Playfair Display"` (`600 italic`) reserved strictly for `.editorial-accent` spans inside primary headings.

### Fluid `clamp()` Type Scale (`320px` -> `1920px`)
- `--text-xs`: `clamp(0.75rem, 0.72rem + 0.15vw, 0.82rem)`
- `--text-sm`: `clamp(0.875rem, 0.84rem + 0.18vw, 0.95rem)`
- `--text-base`: `clamp(1rem, 0.96rem + 0.22vw, 1.06rem)`
- `--text-lg`: `clamp(1.125rem, 1.05rem + 0.4vw, 1.3rem)`
- `--text-xl`: `clamp(1.35rem, 1.2rem + 0.75vw, 1.75rem)`
- `--text-2xl`: `clamp(1.75rem, 1.4rem + 1.6vw, 2.5rem)`
- `--text-3xl`: `clamp(2.15rem, 1.65rem + 2.6vw, 3.4rem)`
- `--text-display`: `clamp(2.45rem, 1.8rem + 3.8vw, 4.65rem)`

---

## 4. Layout, Viewport & Tactile Ergonomics (`taste-design` + `a11y-debugging`)
- **Viewport Units**: Always use `100svh` / `100dvh` (never `100vh`) and `overflow-x: clip` on `body` so `position: sticky` works uninterrupted across `.obra-scroll-runway`.
- **Dual-Unit Navigation (`320px` -> Ultrawide)**:
  - `>= 1024px` (`64rem`): `.unit-switcher` pill integrated into `.site-header`.
  - `< 1024px`: `.mobile-unit-bar` fixed directly beneath `.site-header` (`--mobile-unit-bar-height: 3.15rem`) so mobile users switch between Construtora and Locações in 1 tap without opening the drawer.
- **100% Touch Target Floor (`>= 44x44px`)**: Every interactive button, icon toggle, 3D camera HUD button (`.iso-hud__btn`), 3D preset pill (`.iso-views__btn`), stage milestone, simulator preset pill, and catalog `.filter-pill` enforces `min-height: 2.75rem` (`44px`) and `min-width: 2.75rem`.
- **Low-Height Calibration (`1366x768` / `max-height: 800px`)**: Compact vertical rhythm on `.obra-pinned-viewport` ensures the 6-stage milestone bar, 3D viewport, and engineering inspection panel fit cleanly without clipping.

---

## 5. Motion, 3D Engine & CSP `style-src-attr 'none'` Rules
- **Compositor-Only Motion**: Animate exclusively `transform`, `translate`, `scale`, and `opacity` using `--ease-editorial: cubic-bezier(0.22, 1, 0.36, 1)`.
- **Strict Zero Inline Styles (`INV-07`)**: `style="..."` attributes, `element.style.*` mutations, and `Animation.commitStyles()` are strictly forbidden. All JavaScript-driven motion operates via `static/js/modules/waapi-driver.js` (`KeyframeEffect` / `Element.animate()`).
- **Accessible Kinetic Typography**: `[data-kinetic]` preserves full `aria-label` on the semantic heading while marking visual `.kinetic-mask` / `.kinetic-unit` spans `aria-hidden="true"`.
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` disables kinetic splits, unpins `.obra-scroll-runway` into a direct interactive layout, and resolves states instantaneously.

---

## 6. Strict Anti-Patterns (Forbidden)
1. Rendering the acronym `"MCMV"` anywhere in HTML, attributes, labels, comments, or visible payloads (`INV-02` — always write `"Minha Casa Minha Vida"`).
2. External CDNs (`unpkg.com`, `fonts.googleapis.com`, `images.unsplash.com`).
3. Using `float` for monetary or interest calculations (`INV-03`).
4. Manual `<input>` elements in Django form templates instead of `{{ form|crispy }}` (`INV-04`).
5. Generic SaaS purple/neon gradients, pure `#000000` backgrounds, or tap targets smaller than `44x44px`.
