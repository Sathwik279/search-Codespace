const assert = require("node:assert/strict");
const test = require("node:test");
const StringBTree = require("../indexes/btree.js");
const PermutermIndex = require("../indexes/permuterm-index.js");
const SearchTokenizer = require("../search/tokenizer.js");
const SearchIndexBuilder = require("../search/index-builder.js");
const SearchQueryExecutor = require("../search/query-executor.js");

test("tokenizer uses ASCII alphanumerics and retains offsets and ordinals", () => {
  assert.deepEqual(Array.from(SearchTokenizer.tokenizePage("Apple, café42!")), [
    { term: "apple", position: 0, ordinal: 0 },
    { term: "caf", position: 7, ordinal: 1 },
    { term: "42", position: 11, ordinal: 2 }
  ]);
  assert.deepEqual(SearchTokenizer.tokenizeQuery("APP, café42"), ["app", "caf", "42"]);
  assert.deepEqual(SearchTokenizer.tokenizeQueryPatterns("c*t"), ["c*t"]);
});

test("index builder creates a searchable index and reports character count", async () => {
  const result = await SearchIndexBuilder.build(["Apple banana", "application"]);

  assert.equal(result.indexedWordCount, 3);
  assert.equal(result.extractedCharacterCount, 25);
  assert.deepEqual(result.index.prefixSearch("app").map(({ key }) => key), [
    "apple",
    "application"
  ]);
  assert.deepEqual(
    result.permutermIndex.prefixSearch("le$app").map(({ term }) => term),
    ["apple"]
  );
});

test("permuterm index stores rotations and restores rotation-to-term mappings", () => {
  const permutermIndex = new PermutermIndex(1);
  permutermIndex.addTerm("cat");

  assert.deepEqual(
    permutermIndex.prefixSearch("at$").map(({ key, term }) => ({ key, term })),
    [{ key: "at$c", term: "cat" }]
  );
  assert.deepEqual(
    permutermIndex.prefixSearch("$ca").map(({ key, term }) => ({ key, term })),
    [{ key: "$cat", term: "cat" }]
  );

  const restored = PermutermIndex.deserialize(
    JSON.parse(JSON.stringify(permutermIndex.serialize()))
  );
  assert.deepEqual(
    restored.prefixSearch("t$").map(({ term }) => term),
    ["cat"]
  );
});

test("index builder reports progress and stops when the build is cancelled", async () => {
  let progressReports = 0;
  const result = await SearchIndexBuilder.build(
    [Array(25000).fill("word").join(" ")],
    {
      onProgress: async ({ indexedWordCount }) => {
        progressReports += 1;
        assert.equal(indexedWordCount, 25000);
      },
      isCancelled: () => true
    }
  );

  assert.equal(progressReports, 1);
  assert.equal(result, null);
});

test("query executor uses single-word prefixes and returns unranked occurrences", async () => {
  const pageTexts = ["Apple application banana", "apply band"];
  const { index } = await SearchIndexBuilder.build(pageTexts);

  const results = SearchQueryExecutor.search(
    index,
    new PermutermIndex(2),
    pageTexts,
    "app"
  );

  assert.deepEqual(
    results.map(({ page, occurrenceCount }) => ({ page, occurrenceCount })),
    [
      { page: 1, occurrenceCount: 2 },
      { page: 2, occurrenceCount: 1 }
    ]
  );
  assert.deepEqual(
    results[0].occurrences.map(({ position, terms }) => ({ position, terms })),
    [
      { position: 0, terms: ["apple"] },
      { position: 6, terms: ["application"] }
    ]
  );
  const firstOccurrence = results[0].occurrences[0];
  assert.equal(
    firstOccurrence.snippet.slice(firstOccurrence.matchStart, firstOccurrence.matchEnd),
    "Apple"
  );
  assert.equal(Object.hasOwn(results[0], "score"), false);
});

test("query executor matches multi-word phrases using consecutive token ordinals", async () => {
  const pageTexts = [
    "quick brown fox; quick red fox",
    "brown quick red fox",
    "quick,brown fox"
  ];
  const { index, permutermIndex } = await SearchIndexBuilder.build(pageTexts);
  const restoredIndex = StringBTree.deserialize(
    JSON.parse(JSON.stringify(index.serialize()))
  );
  const restoredPermutermIndex = PermutermIndex.deserialize(
    JSON.parse(JSON.stringify(permutermIndex.serialize()))
  );

  const results = SearchQueryExecutor.search(
    index,
    permutermIndex,
    pageTexts,
    "qui bro"
  );
  const restoredResults = SearchQueryExecutor.search(
    restoredIndex,
    restoredPermutermIndex,
    pageTexts,
    "qui bro"
  );
  const wildcardPhraseResults = SearchQueryExecutor.search(
    index,
    permutermIndex,
    pageTexts,
    "qu*k bro"
  );

  assert.deepEqual(
    results.map(({ page, occurrenceCount }) => ({ page, occurrenceCount })),
    [
      { page: 1, occurrenceCount: 1 },
      { page: 3, occurrenceCount: 1 }
    ]
  );
  assert.deepEqual(restoredResults, results);
  assert.deepEqual(wildcardPhraseResults, results);
  assert.deepEqual(results[0].occurrences[0].terms, ["quick", "brown"]);
  assert.equal(
    results[0].occurrences[0].snippet.slice(
      results[0].occurrences[0].matchStart,
      results[0].occurrences[0].matchEnd
    ),
    "quick brown"
  );
  assert.deepEqual(
    SearchQueryExecutor.search(index, permutermIndex, pageTexts, "quick fox"),
    []
  );
});

test("permuterm wildcards resolve prefix, suffix, and middle patterns", async () => {
  const pageTexts = ["cat cot cut coat scatter"];
  const { index, permutermIndex } = await SearchIndexBuilder.build(pageTexts);

  const search = (query) =>
    SearchQueryExecutor.search(index, permutermIndex, pageTexts, query)
      .flatMap((page) => page.occurrences.map((occurrence) => occurrence.terms[0]));

  assert.deepEqual(search("ca*"), ["cat"]);
  assert.deepEqual(search("*at"), ["cat", "coat"]);
  assert.deepEqual(search("c*t"), ["cat", "cot", "cut", "coat"]);
  assert.deepEqual(search("*"), ["cat", "cot", "cut", "coat", "scatter"]);
  assert.throws(() => search("c*t*"), /Only one wildcard/);
});
