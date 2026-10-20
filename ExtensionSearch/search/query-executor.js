(function exposeSearchQueryExecutor(global) {
  const SearchTokenizer =
    global.SearchTokenizer ||
    (typeof require === "function" ? require("./tokenizer.js") : null);

  function search(index, pageTexts, query) {
    if (!index || typeof index.prefixSearch !== "function") {
      throw new TypeError("Search index must support prefixSearch(prefix).");
    }
    if (
      !Array.isArray(pageTexts) ||
      !pageTexts.every((pageText) => typeof pageText === "string")
    ) {
      throw new TypeError("Page texts must be an array of strings.");
    }

    const queryTokens = new Set(SearchTokenizer.tokenizeQuery(query));
    if (queryTokens.size === 0) return [];

    const pages = new Map();
    for (const queryToken of queryTokens) {
      const matchingTerms = index.prefixSearch(queryToken);
      for (const matchingTerm of matchingTerms) {
        for (const pagePostings of matchingTerm.postings) {
          if (
            !Array.isArray(pagePostings.positions) ||
            !Array.isArray(pagePostings.lengths) ||
            pagePostings.positions.length !== pagePostings.lengths.length
          ) {
            throw new TypeError("Search index contains invalid posting positions.");
          }

          let pageResult = pages.get(pagePostings.page);
          if (!pageResult) {
            pageResult = {
              page: pagePostings.page,
              occurrences: new Map()
            };
            pages.set(pagePostings.page, pageResult);
          }

          for (
            let postingIndex = 0;
            postingIndex < pagePostings.positions.length;
            postingIndex += 1
          ) {
            const position = pagePostings.positions[postingIndex];
            const occurrence = pageResult.occurrences.get(position);
            if (occurrence) {
              occurrence.terms.add(matchingTerm.key);
            } else {
              pageResult.occurrences.set(position, {
                position,
                end: position + pagePostings.lengths[postingIndex],
                terms: new Set([matchingTerm.key])
              });
            }
          }
        }
      }
    }

    return Array.from(pages.values())
      .map((result) => {
        const pageText = pageTexts[result.page - 1] || "";
        const occurrences = Array.from(result.occurrences.values())
          .sort((left, right) => left.position - right.position)
          .map((occurrence) => {
            const snippetStart = Math.max(0, occurrence.position - 70);
            const snippetEnd = Math.min(pageText.length, occurrence.end + 70);
            const snippet = pageText.slice(snippetStart, snippetEnd);
            return {
              snippet,
              leadingEllipsis: snippetStart > 0,
              trailingEllipsis: snippetEnd < pageText.length,
              matchStart: occurrence.position - snippetStart,
              matchEnd: occurrence.end - snippetStart,
              position: occurrence.position,
              terms: Array.from(occurrence.terms).sort()
            };
          });
        return {
          page: result.page,
          occurrenceCount: occurrences.length,
          occurrences
        };
      })
      .sort((left, right) => left.page - right.page);
  }

  const executor = { search };
  global.SearchQueryExecutor = executor;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = executor;
  }
})(globalThis);
