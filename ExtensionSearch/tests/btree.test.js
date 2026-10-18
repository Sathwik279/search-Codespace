const assert = require("node:assert/strict");
const test = require("node:test");
const StringBTree = require("../btree.js");

test("groups repeated term positions by page and supports prefix lookup", () => {
  const tree = new StringBTree(2);
  tree.insert("search", { page: 1, position: 4, end: 10 });
  tree.insert("search", { page: 1, position: 20, end: 26 });
  tree.insert("search", { page: 2, position: 9, end: 15 });
  tree.insert("searchable", { page: 2, position: 30, end: 40 });

  assert.deepEqual(tree.search("search"), [
    { page: 1, positions: [4, 20], lengths: [6, 6] },
    { page: 2, positions: [9], lengths: [6] }
  ]);
  assert.deepEqual(tree.prefixSearch("se").map(({ key }) => key), [
    "search",
    "searchable"
  ]);
});

test("preserves grouped positions through B-tree splits and serialization", () => {
  const tree = new StringBTree(1);
  for (let index = 0; index < 40; index += 1) {
    const key = `term${String(index).padStart(2, "0")}`;
    tree.insert(key, { page: 3, position: index, end: index + key.length });
    tree.insert(key, { page: 3, position: index + 100, end: index + 100 + key.length });
  }

  const restored = StringBTree.deserialize(tree.serialize());
  const postings = restored.search("term17");
  assert.deepEqual(postings, [
    { page: 3, positions: [17, 117], lengths: [6, 6] }
  ]);
  assert.deepEqual(
    restored.prefixSearch("term3").map(({ key }) => key),
    ["term30", "term31", "term32", "term33", "term34", "term35", "term36", "term37", "term38", "term39"]
  );
});

test("retains original match length when normalization changes its length", () => {
  const tree = new StringBTree(2);
  tree.insert("i\u0307", { page: 1, position: 12, end: 13 });

  assert.deepEqual(tree.search("i\u0307"), [
    { page: 1, positions: [12], lengths: [1] }
  ]);
});
