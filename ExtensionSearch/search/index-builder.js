(function exposeSearchIndexBuilder(global) {
  const StringBTree =
    global.StringBTree ||
    (typeof require === "function" ? require("../indexes/btree.js") : null);
  const PermutermIndex =
    global.PermutermIndex ||
    (typeof require === "function" ? require("../indexes/permuterm-index.js") : null);
  const SearchTokenizer =
    global.SearchTokenizer ||
    (typeof require === "function" ? require("./tokenizer.js") : null);
  const TrigramIndex =
    global.TrigramIndex ||
    (typeof require === "function" ? require("./trigram-index.js") : null);

  async function build(pageTexts, options = {}) {
    if (
      !Array.isArray(pageTexts) ||
      !pageTexts.every((pageText) => typeof pageText === "string")
    ) {
      throw new TypeError("Page texts must be an array of strings.");
    }

    const onProgress = options.onProgress || (async () => {});
    const isCancelled = options.isCancelled || (() => false);
    if (typeof onProgress !== "function" || typeof isCancelled !== "function") {
      throw new TypeError("Index builder callbacks must be functions.");
    }

    const index = new StringBTree(2);
    const permutermIndex = new PermutermIndex(2);
    const trigramIndex = new TrigramIndex();
    const indexedTerms = new Set();
    let indexedWordCount = 0;
    let extractedCharacterCount = 0;

    for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
      const pageText = pageTexts[pageIndex];
      extractedCharacterCount += pageText.length;
      if (pageIndex > 0) extractedCharacterCount += 2;

      for (const token of SearchTokenizer.tokenizePage(pageText)) {
        index.insert(token.term, {
          page: pageIndex + 1,
          position: token.position,
          ordinal: token.ordinal
        });
        if (!indexedTerms.has(token.term)) {
          permutermIndex.addTerm(token.term);
          trigramIndex.addTerm(token.term);
          indexedTerms.add(token.term);
        }
        indexedWordCount += 1;

        if (indexedWordCount % 25000 === 0) {
          await onProgress({
            pageNumber: pageIndex + 1,
            totalPages: pageTexts.length,
            indexedWordCount
          });
          if (isCancelled()) return null;
        }
      }
    }

    if (isCancelled()) return null;
    return { index, permutermIndex, trigramIndex, indexedWordCount, extractedCharacterCount };
  }

  const builder = { build };
  global.SearchIndexBuilder = builder;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = builder;
  }
})(globalThis);
