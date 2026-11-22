# terminal-standalone

The `terminal` theme with `cyber-core` folded into it, so it needs no second
theme:

```toml
theme = ['terminal-standalone']
```

It renders the same site as `theme = ['terminal', 'cyber-core']`. Building the
sample site both ways gives identical pages, apart from the stylesheet's
fingerprint and the Mermaid loader script (see below).

## What is inside

| From | Files |
|---|---|
| `terminal` | `layouts/` (base, home, page, list, taxonomy, 404, header/footer partials, `mermaid-config.html`) and `assets/css/` |
| `cyber-core` | `layouts/_shortcodes/`, `layouts/_markup/`, `layouts/_partials/cc/`, `layouts/index.json`, `layouts/search.html`, `data/cdn.toml`, `static/js/search.js` |

The files are copies, trimmed of code that nothing in this theme can reach. The
one file both themes have is `_partials/mermaid-config.html`; the terminal one
is kept, as it wins when the two themes are composed. `cyber-core`'s README
documents the shortcodes, the render hooks and the `cc/` partials.

What was left out:

- `cc/search-form.html`: no terminal template includes it.
- The `version` keys in `data/cdn.toml`: nothing reads them, the version is in
  each `base` URL.
- In `cc/scripts.html`, the run-time Mermaid hooks (`window.cyberMermaidConfig`
  and `window.cyberRenderMermaid`): the terminal palette is fixed, so nothing
  defines or calls them.
- Branches that cannot differ: the "either stylesheet may be missing" guards in
  `cc/meta.html`, and the `with` wrappers around `srcset` and the alt text in
  `render-image.html`.
- Three CSS rules that style nothing (`.prose em`, `h2.cmd::before`,
  `.search-result-title::before`).

## Keeping it in step

The copies do not follow `terminal` or `cyber-core` on their own. After
changing either, copy the change here, then check that the two setups still
render the same site. The stylesheet hash is set aside first; the only page
allowed to differ is one with a Mermaid diagram, whose loader script is shorter
here:

```sh
hugo -t terminal,cyber-core -d /tmp/composed
hugo -t terminal-standalone -d /tmp/standalone
for d in composed standalone; do
  find /tmp/$d -name '*.html' -exec sed -i -E 's/bundle\.min\.[a-f0-9]+\.css/bundle.css/; s/ integrity="sha256-[^"]+"//' {} +
  rm /tmp/$d/css/bundle.min.*.css
done
diff -rq /tmp/composed /tmp/standalone
```
