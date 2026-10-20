const assert = require("node:assert/strict");
const test = require("node:test");
const SearchTokenizer = require("../search/tokenizer.js");
const SearchIndexBuilder = require("../search/index-builder.js");
const SearchQueryExecutor = require("../search/query-executor.js");

test("tokenizer normalizes terms while retaining original positions", () => {
  assert.deepEqual(Array.from(SearchTokenizer.tokenizePage("Apple, Île!")), [
    { term: "apple", position: 0, end: 5 },
    { term: "île", position: 7, end: 10 }
  ]);
  assert.deepEqual(SearchTokenizer.tokenizeQuery("APP, ÎLE"), ["app", "île"]);
});

test("index builder creates a searchable index and reports character count", async () => {
  const result = await SearchIndexBuilder.build(["Apple banana", "application"]);

  assert.equal(result.indexedWordCount, 3);
  assert.equal(result.extractedCharacterCount, 25);
  assert.deepEqual(result.index.prefixSearch("app").map(({ key }) => key), [
    "apple",
    "application"
  ]);
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

test("query executor expands prefixes and returns unranked page occurrences", async () => {
  const pageTexts = ["Apple application banana", "apply band"];
  const { index } = await SearchIndexBuilder.build(pageTexts);

  const results = SearchQueryExecutor.search(index, pageTexts, "app ban");

  assert.deepEqual(
    results.map(({ page, occurrenceCount }) => ({ page, occurrenceCount })),
    [
      { page: 1, occurrenceCount: 3 },
      { page: 2, occurrenceCount: 2 }
    ]
  );
  assert.deepEqual(
    results[0].occurrences.map(({ position, terms }) => ({ position, terms })),
    [
      { position: 0, terms: ["apple"] },
      { position: 6, terms: ["application"] },
      { position: 18, terms: ["banana"] }
    ]
  );
  assert.equal(Object.hasOwn(results[0], "score"), false);
});
