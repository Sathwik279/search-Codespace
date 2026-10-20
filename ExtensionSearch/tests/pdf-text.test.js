const assert = require("node:assert/strict");
const test = require("node:test");
const { extractPageText } = require("../pdf-text.js");
const StringBTree = require("../indexes/btree.js");
const SearchTokenizer = require("../search/tokenizer.js");

function indexPage(index, pageText) {
  for (const token of SearchTokenizer.tokenizePage(pageText)) {
    index.insert(token.term, {
      page: 1,
      position: token.position,
      ordinal: token.ordinal
    });
  }
}

test("joins a word hyphenated across a PDF line break", () => {
  const items = [
    { str: "The tokeniza-", hasEOL: true },
    { str: "tion process", hasEOL: true },
    { str: "works.", hasEOL: false }
  ];

  assert.equal(extractPageText(items), "The tokenization process works.");
});

test("indexes a hyphenated footer occurrence as the complete word", () => {
  const items = [
    { str: "Page body without the query.", hasEOL: true },
    { str: "3", hasEOL: false },
    { str: "The tokeniza-", hasEOL: true },
    { str: "tion footnote.", hasEOL: false }
  ];
  const pageText = extractPageText(items);
  const index = new StringBTree(2);
  indexPage(index, pageText);

  const postings = index.search("tokenization");
  assert.equal(postings.length, 1);
  assert.equal(postings[0].page, 1);
  assert.equal(postings[0].positions.length, 1);
  const position = postings[0].positions[0];
  assert.equal(
    pageText.slice(position, position + "tokenization".length),
    "tokenization"
  );
});

test("retains searchable text after a footer line break", () => {
  const items = [
    { str: "Main body text.", hasEOL: true },
    { str: "3", hasEOL: false },
    { str: "The tokeniza-", hasEOL: true },
    { str: "tion footnote.", hasEOL: false }
  ];

  assert.equal(extractPageText(items), "Main body text. 3 The tokenization footnote.");
});

test("joins visual line breaks without merging ordinary words", () => {
  const items = [
    { str: "First line", hasEOL: true },
    { str: "second line", hasEOL: true },
    { str: "Third line", hasEOL: false }
  ];

  assert.equal(extractPageText(items), "First line second line Third line");
});

test("handles PDF.js items without end-of-line metadata", () => {
  const items = [{ str: "alpha" }, { str: "beta" }];

  assert.equal(extractPageText(items), "alpha beta");
});

test("rejoins OCR words with spaces between letters inside a text item", () => {
  const items = [
    { str: "C o n t e n t s", hasEOL: true },
    { str: "The prime m i s s i o n is clear.", hasEOL: true },
    { str: "o f", hasEOL: false }
  ];

  const pageText = extractPageText(items);
  assert.equal(pageText, "Contents The prime mission is clear. of");

  const index = new StringBTree(2);
  indexPage(index, pageText);
  const postings = index.search("mission");
  assert.equal(postings.length, 1);
  const position = postings[0].positions[0];
  assert.equal(pageText.slice(position, position + "mission".length), "mission");
});

test("ignores items without string text and trims empty lines", () => {
  const items = [
    { str: "", hasEOL: true },
    { str: null, hasEOL: false },
    { str: "  searchable text  ", hasEOL: false }
  ];

  assert.equal(extractPageText(items), "searchable text");
});

test("preserves the word break for a line ending without a hyphen", () => {
  const items = [
    { str: "search", hasEOL: true },
    { str: "term", hasEOL: false }
  ];

  assert.equal(extractPageText(items), "search term");
});
