(function exposeSearchQueryExecutor(global) {
  const SearchTokenizer =
    global.SearchTokenizer ||
    (typeof require === "function" ? require("./tokenizer.js") : null);

  function getMatchingTerms(index, permutermIndex, pattern) {
    const wildcardIndex = pattern.indexOf("*");
    if (wildcardIndex === -1) {
      return index.prefixSearch(pattern);
    }

    const left = pattern.slice(0, wildcardIndex);
    const right = pattern.slice(wildcardIndex + 1);
    if (right === "" && left !== "") {
      return index.prefixSearch(left);
    }

    const permutermPrefix = right === "" && left === "" ? "$" : `${right}$${left}`;
    const matchingTerms = new Map();
    for (const { term } of permutermIndex.prefixSearch(permutermPrefix)) {
      if (!term.startsWith(left) || !term.endsWith(right)) continue;
      const postings = index.search(term);
      if (Array.isArray(postings)) {
        matchingTerms.set(term, { key: term, postings });
      }
    }
    return Array.from(matchingTerms.values());
  }

  function getEditDistance(left, right, maximumDistance) {
    if (Math.abs(left.length - right.length) > maximumDistance) return maximumDistance + 1;

    let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const currentRow = [leftIndex];
      let rowMinimum = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        currentRow[rightIndex] = Math.min(
          currentRow[rightIndex - 1] + 1,
          previousRow[rightIndex] + 1,
          previousRow[rightIndex - 1] + cost
        );
        rowMinimum = Math.min(rowMinimum, currentRow[rightIndex]);
      }
      if (rowMinimum > maximumDistance) return maximumDistance + 1;
      previousRow = currentRow;
    }
    return previousRow[right.length];
  }

  function suggest(index, trigramIndex, query, limit = 3) {
    if (!index || typeof index.prefixSearch !== "function") {
      throw new TypeError("Search index must support prefixSearch(prefix).");
    }
    if (!trigramIndex || typeof trigramIndex.findCandidates !== "function") {
      throw new TypeError("Trigram index must support findCandidates(term).");
    }
    if (typeof query !== "string") {
      throw new TypeError("Search query must be a string.");
    }
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError("Suggestion limit must be a positive integer.");
    }

    const matches = Array.from(query.matchAll(/[A-Za-z0-9*]+/g));
    let alternatives = [{ query: "", score: 0 }];
    let hasCorrection = false;
    let previousEnd = 0;

    for (const match of matches) {
      const token = match[0].toLowerCase();
      const isTypoCandidate =
        !token.includes("*") &&
        index.prefixSearch(token).length === 0;
      let options = [{ term: match[0], score: 0 }];

      if (isTypoCandidate) {
        const maximumDistance = Math.min(3, Math.max(1, Math.ceil(token.length / 4)));
        options = trigramIndex.findCandidates(token)
          .map(({ term, jaccard }) => ({
            term,
            jaccard,
            distance: getEditDistance(token, term, maximumDistance)
          }))
          .filter(({ distance }) => distance <= maximumDistance)
          .sort((left, right) =>
            left.distance - right.distance ||
            right.jaccard - left.jaccard ||
            left.term.localeCompare(right.term)
          )
          .slice(0, limit)
          .map(({ term, distance, jaccard }) => ({
            term,
            score: distance + (1 - jaccard)
          }));
        if (options.length > 0) hasCorrection = true;
      }

      const unchangedText = query.slice(previousEnd, match.index);
      alternatives = alternatives.flatMap((alternative) =>
        options.map((option) => ({
          query: `${alternative.query}${unchangedText}${option.term}`,
          score: alternative.score + option.score
        }))
      )
        .sort((left, right) => left.score - right.score || left.query.localeCompare(right.query))
        .slice(0, limit);
      previousEnd = match.index + match[0].length;
    }

    if (!hasCorrection) return [];
    const suffix = query.slice(previousEnd);
    return alternatives
      .map((alternative) => `${alternative.query}${suffix}`)
      .filter((suggestion) => suggestion.toLowerCase() !== query.toLowerCase());
  }

  function search(index, permutermIndex, pageTexts, query) {
    if (!index || typeof index.prefixSearch !== "function") {
      throw new TypeError("Search index must support prefixSearch(prefix).");
    }
    if (
      !permutermIndex ||
      typeof permutermIndex.prefixSearch !== "function"
    ) {
      throw new TypeError("Permuterm index must support prefixSearch(prefix).");
    }
    if (
      !Array.isArray(pageTexts) ||
      !pageTexts.every((pageText) => typeof pageText === "string")
    ) {
      throw new TypeError("Page texts must be an array of strings.");
    }

    if (typeof query !== "string") {
      throw new TypeError("Search query must be a string.");
    }
    const wildcardCount = (query.match(/\*/g) || []).length;
    if (wildcardCount > 1) {
      throw new TypeError("Only one wildcard (*) is supported per query.");
    }

    const queryTokens = SearchTokenizer.tokenizeQueryPatterns(query);
    if (queryTokens.length === 0) return [];

    const candidatesByToken = queryTokens.map(() => new Map());
    for (let queryIndex = 0; queryIndex < queryTokens.length; queryIndex += 1) {
      const candidatesByPage = candidatesByToken[queryIndex];
      const matchingTerms = getMatchingTerms(index, permutermIndex, queryTokens[queryIndex]);
      for (const matchingTerm of matchingTerms) {
        for (const pagePosting of matchingTerm.postings) {
          if (
            !Array.isArray(pagePosting.positions) ||
            !Array.isArray(pagePosting.ordinals) ||
            pagePosting.positions.length !== pagePosting.ordinals.length
          ) {
            throw new TypeError("Search index contains invalid posting positions.");
          }

          let pageCandidates = candidatesByPage.get(pagePosting.page);
          if (!pageCandidates) {
            pageCandidates = new Map();
            candidatesByPage.set(pagePosting.page, pageCandidates);
          }

          for (let postingIndex = 0; postingIndex < pagePosting.positions.length; postingIndex += 1) {
            const position = pagePosting.positions[postingIndex];
            const ordinal = pagePosting.ordinals[postingIndex];
            pageCandidates.set(ordinal, {
              position,
              end: position + matchingTerm.key.length,
              term: matchingTerm.key
            });
          }
        }
      }
    }

    const resultsByPage = new Map();
    for (const [page, firstTokenCandidates] of candidatesByToken[0]) {
      for (const [firstOrdinal, firstOccurrence] of firstTokenCandidates) {
        const phraseTerms = [firstOccurrence.term];
        let lastOccurrence = firstOccurrence;
        let isPhraseMatch = true;

        for (let queryIndex = 1; queryIndex < queryTokens.length; queryIndex += 1) {
          const nextOccurrence = candidatesByToken[queryIndex]
            .get(page)
            ?.get(firstOrdinal + queryIndex);
          if (!nextOccurrence) {
            isPhraseMatch = false;
            break;
          }
          phraseTerms.push(nextOccurrence.term);
          lastOccurrence = nextOccurrence;
        }
        if (!isPhraseMatch) continue;

        let pageOccurrences = resultsByPage.get(page);
        if (!pageOccurrences) {
          pageOccurrences = [];
          resultsByPage.set(page, pageOccurrences);
        }
        pageOccurrences.push({
          position: firstOccurrence.position,
          end: lastOccurrence.end,
          terms: phraseTerms
        });
      }
    }

    return Array.from(resultsByPage, ([page, pageOccurrences]) => {
      const pageText = pageTexts[page - 1] || "";
      const occurrences = pageOccurrences
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
            terms: occurrence.terms
          };
        });
      return {
        page,
        occurrenceCount: occurrences.length,
        occurrences
      };
    }).sort((left, right) => left.page - right.page);
  }

  const executor = { search, suggest };
  global.SearchQueryExecutor = executor;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = executor;
  }
})(globalThis);
