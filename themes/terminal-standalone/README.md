# terminal-standalone

The theme for alban.sh: a terminal-styled Hugo theme that works on its own,
with no second theme needed.

```toml
theme = ['terminal-standalone']
```

## Site configuration it expects

- `params.mainSections = ['posts']`: the section listed on the home page.
- `[taxonomies]` with `tag = 'tags'` and `series = 'series'`.
- `[outputs] home = ['html', 'rss', 'json']`: the JSON search index read by
  `/search/`.
- `markup.goldmark.parser.wrapStandAloneImageWithinParagraph = false`, so that
  a standalone image becomes a `<figure>`.

## Front matter

| Key | Effect |
|---|---|
| `description` | Summary in lists and meta tags |
| `tags`, `series` | Taxonomy links, series navigation, related posts |
| `toc: true` | Table of contents (h2 and h3) |
| `math: true` | Loads KaTeX on that page |

## Shortcodes

- `callout`: highlighted note (`type` is info, tip, warning or danger, plus an
  optional `title`).
- `spoiler`: collapsible `<details>` block (`title`, `open`).
- `cve`: badge linking to NVD (`id`, plus optional `score` and `name`).

Each file in `layouts/_shortcodes/` documents its parameters.

## Render hooks

- **Images:** resized to WebP with `srcset`. A relative path is looked up as a
  page resource first, then in `assets/`. A path that matches neither fails
  the build.
- **Links:** external links open in a new tab. A relative link that points
  nowhere fails the build.
- **Mermaid:** a fenced ` ```mermaid ` block renders as a diagram. Mermaid is
  loaded only on pages that have one.

## Third-party scripts

KaTeX and Mermaid come from jsDelivr, pinned to exact versions with
Subresource Integrity hashes in `data/cdn.toml`. That file explains how to
upgrade them.
