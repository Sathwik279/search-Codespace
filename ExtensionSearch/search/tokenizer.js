(function exposeSearchTokenizer(global) {
  function* tokenizePage(text) {
    if (typeof text !== "string") {
      throw new TypeError("Page text must be a string.");
    }

    for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      yield {
        term: match[0].toLocaleLowerCase(),
        position: match.index,
        end: match.index + match[0].length
      };
    }
  }

  function tokenizeQuery(query) {
    if (typeof query !== "string") {
      throw new TypeError("Search query must be a string.");
    }

    return Array.from(
      query.matchAll(/[\p{L}\p{N}]+/gu),
      (match) => match[0].toLocaleLowerCase()
    );
  }

  const tokenizer = { tokenizePage, tokenizeQuery };
  global.SearchTokenizer = tokenizer;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = tokenizer;
  }
})(globalThis);
