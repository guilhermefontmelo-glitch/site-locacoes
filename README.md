# Site de Locação de Equipamentos — Rocha Construtora

Landing page em Django para locação de andaimes, escoras, betoneiras e ferramentas
de construção em Viçosa do Ceará - CE.

- **Site publicado:** https://site-locacoes.vercel.app
- **Stack:** Django 6.1 + Tailwind CSS 4
- **Hospedagem:** Vercel (deploy automático a cada push na branch `main`)

## Rodar localmente

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python manage.py runserver
```

## CSS (Tailwind)

```powershell
npm install
npm run css:dev     # durante o desenvolvimento (watch)
npm run css:build   # antes de publicar
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `config/` | Configuração do Django (`settings.py`, `urls.py`, `wsgi.py`) |
| `locacoes/templates/` | `home.html` (página única) |
| `locacoes/static/` | CSS, JS e imagens |
| `src/input.css` | Fonte do Tailwind |

## Publicar

Depois de alterar o código:

```powershell
npm run css:build        # se mexeu em classes Tailwind
git add -A
git commit -m "descrição da mudança"
git push                 # a Vercel publica sozinha
```

## Contato

- Douglas: (88) 99424-8183
- Rocha Construtora: (88) 99225-8807
- Rua Vereador Luiz Carlos de Sampaio, 366 — Santa Bárbara, Viçosa do Ceará - CE
