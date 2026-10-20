(function exposeSearchTokenizer(global) {
  function* tokenizePage(text) {
    if (typeof text !== "string") {
      throw new TypeError("Page text must be a string.");
    }

    let ordinal = 0;
    for (const match of text.matchAll(/[A-Za-z0-9]+/g)) {
      yield {
        term: match[0].toLowerCase(),
        position: match.index,
        ordinal
      };
      ordinal += 1;
    }
  }

  function tokenizeQuery(query) {
    if (typeof query !== "string") {
      throw new TypeError("Search query must be a string.");
    }

    return Array.from(
      query.matchAll(/[A-Za-z0-9]+/g),
      (match) => match[0].toLowerCase()
    );
  }

  function tokenizeQueryPatterns(query) {
    if (typeof query !== "string") {
      throw new TypeError("Search query must be a string.");
    }

    return Array.from(
      query.matchAll(/[A-Za-z0-9*]+/g),
      (match) => match[0].toLowerCase()
    );
  }

  const tokenizer = { tokenizePage, tokenizeQuery, tokenizeQueryPatterns };
  global.SearchTokenizer = tokenizer;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = tokenizer;
  }
})(globalThis);
