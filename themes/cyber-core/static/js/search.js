/*
 * Client-side search for the blog. No dependencies.
 *
 * Markup contract (see layouts/_partials/cc/search.html):
 *   [data-search][data-index="/index.json"]
 *     input[type=search]   the query
 *     .search-status       "3 results for …" (aria-live)
 *     .search-results      <ol> filled with one <li class="search-result"> per hit
 *
 * Every query word must appear in the post (AND). Ranking: title > tags >
 * summary > body. The query lives in the URL (?q=…), so results can be shared
 * and the header search form simply links here.
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-search]");
  if (!root) return;

  var input = root.querySelector("input[type=search]");
  var status = root.querySelector(".search-status");
  var list = root.querySelector(".search-results");
  var indexURL = root.getAttribute("data-index");

  var docs = null;      // normalised copy of the index, built on first use
  var loading = null;   // promise of the index fetch
  var timer = null;

  /* Lower-case and strip accents so "Cafe" finds "café". */
  function normalise(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function countOccurrences(haystack, needle) {
    var count = 0;
    var at = haystack.indexOf(needle);
    while (at !== -1) {
      count++;
      at = haystack.indexOf(needle, at + needle.length);
    }
    return count;
  }

  function loadIndex() {
    if (loading) return loading;
    loading = fetch(indexURL, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (entries) {
        docs = entries.map(function (entry) {
          return {
            entry: entry,
            title: normalise(entry.title),
            tags: normalise((entry.tags || []).concat(entry.categories || [], entry.series || []).join(" ")),
            summary: normalise(entry.summary),
            content: normalise(entry.content),
          };
        });
      });
    return loading;
  }

  function search(query) {
    var terms = normalise(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    var hits = [];
    docs.forEach(function (doc) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i];
        var inTitle = doc.title.indexOf(term) !== -1;
        var inTags = doc.tags.indexOf(term) !== -1;
        var inSummary = doc.summary.indexOf(term) !== -1;
        var inBody = countOccurrences(doc.content, term);
        if (!inTitle && !inTags && !inSummary && !inBody) return; // AND: skip the post
        score += (inTitle ? 10 : 0) + (inTags ? 6 : 0) + (inSummary ? 3 : 0) + Math.min(inBody, 10);
      }
      hits.push({ doc: doc, score: score });
    });

    hits.sort(function (a, b) {
      return b.score - a.score || (a.doc.entry.date < b.doc.entry.date ? 1 : -1);
    });
    return hits;
  }

  /* Append `text` to `parent`, wrapping every query term in <mark>. */
  function appendHighlighted(parent, text, terms) {
    if (!terms.length) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var pattern = new RegExp("(" + terms.map(escapeRegExp).join("|") + ")", "gi");
    text.split(pattern).forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) {
        var mark = document.createElement("mark");
        mark.textContent = part;
        parent.appendChild(mark);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  /* A ~160 character excerpt of the body around the first matching word. */
  function excerpt(entry, terms) {
    var text = String(entry.content || "").replace(/\s+/g, " ").trim();
    var plain = normalise(text);
    var at = -1;
    for (var i = 0; i < terms.length && at === -1; i++) at = plain.indexOf(terms[i]);
    if (at === -1) return String(entry.summary || "");

    var start = Math.max(0, at - 70);
    var end = Math.min(text.length, at + 90);
    return (start > 0 ? "… " : "") + text.slice(start, end).trim() + (end < text.length ? " …" : "");
  }

  function render(query, hits) {
    var terms = normalise(query).split(/\s+/).filter(Boolean);
    list.textContent = "";

    if (!terms.length) {
      status.textContent = "";
      return;
    }
    status.textContent = hits.length
      ? hits.length + (hits.length === 1 ? " result" : " results") + " for “" + query.trim() + "”"
      : "No results for “" + query.trim() + "”.";

    hits.forEach(function (hit) {
      var entry = hit.doc.entry;
      var item = document.createElement("li");
      item.className = "search-result";

      var heading = document.createElement("h2");
      heading.className = "search-result-title";
      var link = document.createElement("a");
      link.href = entry.url;
      appendHighlighted(link, entry.title, terms);
      heading.appendChild(link);
      item.appendChild(heading);

      var meta = document.createElement("p");
      meta.className = "search-result-meta";
      var time = document.createElement("time");
      time.setAttribute("datetime", entry.date);
      time.textContent = entry.date;
      meta.appendChild(time);
      (entry.tags || []).forEach(function (tag) {
        var chip = document.createElement("span");
        chip.className = "search-result-tag";
        chip.textContent = tag;
        meta.appendChild(document.createTextNode(" "));
        meta.appendChild(chip);
      });
      item.appendChild(meta);

      var snippet = document.createElement("p");
      snippet.className = "search-result-excerpt";
      appendHighlighted(snippet, excerpt(entry, terms), terms);
      item.appendChild(snippet);

      list.appendChild(item);
    });
  }

  function run() {
    var query = input.value;

    // Keep the address bar in sync so a search can be shared or bookmarked.
    var url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);

    if (!query.trim()) {
      render(query, []);
      return;
    }
    status.textContent = "Searching…";
    loadIndex().then(
      function () {
        // Ignore the answer if the user kept typing in the meantime.
        if (input.value === query) render(query, search(query));
      },
      function () {
        status.textContent = "The search index could not be loaded.";
      }
    );
  }

  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      run();
    }
  });

  root.addEventListener("submit", function (event) {
    event.preventDefault();
    clearTimeout(timer);
    run();
  });

  var initial = new URLSearchParams(window.location.search).get("q");
  if (initial) {
    input.value = initial;
    run();
  }
})();
