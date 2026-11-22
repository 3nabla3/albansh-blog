# cyber-core

Shared logic for the cybersecurity blog. It carries **no visual styling**: it
emits semantic HTML with stable class names, and every visual theme
(`basic`, `terminal`, `editorial`, `cyberpunk`, `dossier`) decides how that
HTML looks.

It is meant to be listed **after** the visual theme in `hugo.toml`:

```toml
theme = ['terminal', 'cyber-core']
```

Hugo gives the first theme in the list the highest priority, so a visual theme
can override any template defined here by providing a file with the same path.

## Contract with the visual themes

A visual theme provides `baseof.html`, `home.html`, `page.html`,
`section.html`, `taxonomy.html`, `term.html`, `404.html`, its header/footer
partials and its CSS. `cyber-core` provides the following.

| Path | Purpose |
|---|---|
| `_shortcodes/` | `callout`, `cve`, `spoiler` |
| `_markup/` | render hooks for images, links and Mermaid code blocks |
| `_partials/cc/` | components the visual themes call from their templates |
| `_partials/mermaid-config.html` | default Mermaid config (see "Override points") |
| `data/cdn.toml` | pinned versions and SRI hashes of the CDN scripts |
| `index.json`, `search.html` | search index output and the `/search/` page (`content/search.md`, `layout: search`) |
| `static/js/search.js` | dependency-free client-side search |

All partials live under `cc/` so they can never collide with a partial of a
visual theme.

## Override points

* `_partials/mermaid-config.html` — a visual theme can ship its own copy; it
  must `return` a dict that is passed to `mermaid.initialize()` (e.g. a
  `theme` and `themeVariables` matching the palette).
* `window.cyberMermaidConfig()` — optional JavaScript hook for a theme whose
  palette changes at run time (light/dark). When defined, its return value is
  merged over the static config each time diagrams are rendered. After the
  palette changed, call `window.cyberRenderMermaid()` to redraw them.

## Where the visual theme must call cyber-core

* in `<head>`: `{{ partial "cc/meta.html" . }}` (title, description, canonical, RSS link and
  the bundled `css/main.css` + `css/syntax.css`), then `{{ partial "cc/head.html" . }}` (KaTeX stylesheet)
* in the header (optional): `{{ partial "cc/search-form.html" . }}`, a small form that submits to `/search/?q=…`
* at the end of `<body>`, **after** the page content:
  `{{ partial "cc/scripts.html" . }}` (KaTeX and Mermaid loaders)
