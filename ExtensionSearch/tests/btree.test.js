const assert = require("node:assert/strict");
const test = require("node:test");
const StringBTree = require("../indexes/btree.js");

test("groups repeated term positions by page", () => {
  const tree = new StringBTree(2);
  tree.insert("search", { page: 1, position: 4, ordinal: 0 });
  tree.insert("search", { page: 1, position: 20, ordinal: 2 });
  tree.insert("search", { page: 2, position: 9, ordinal: 1 });

  assert.deepEqual(tree.search("search"), [
    { page: 1, positions: [4, 20], ordinals: [0, 2] },
    { page: 2, positions: [9], ordinals: [1] }
  ]);
  assert.equal(tree.search("sea"), null);
  assert.equal(tree.search("missing"), null);
});

test("keeps posting lists in leaves through splits", () => {
  const tree = new StringBTree(1);
  for (let index = 0; index < 40; index += 1) {
    const key = `term${String(index).padStart(2, "0")}`;
    tree.insert(key, { page: 3, position: index, ordinal: index });
    tree.insert(key, { page: 3, position: index + 100, ordinal: index + 100 });
  }

  const visit = (node) => {
    if (node.isLeaf) {
      assert.ok(Array.isArray(node.postings));
      for (let index = 0; index < node.numKeys; index += 1) {
        assert.ok(Array.isArray(node.postings[index]));
      }
      return;
    }
    assert.equal(node.postings, null);
    for (let index = 0; index <= node.numKeys; index += 1) {
      visit(node.pointers[index]);
    }
  };
  visit(tree.root);

  for (let index = 0; index < 40; index += 1) {
    const key = `term${String(index).padStart(2, "0")}`;
    assert.deepEqual(tree.search(key), [
      { page: 3, positions: [index, index + 100], ordinals: [index, index + 100] }
    ]);
  }
});

test("serializes keys and child pointers, with postings only in leaves", () => {
  const tree = new StringBTree(1);
  for (let index = 0; index < 12; index += 1) {
    const key = `term${String(index).padStart(2, "0")}`;
    tree.insert(key, { page: 2, position: index, ordinal: index });
  }

  const serialized = JSON.parse(JSON.stringify(tree.serialize()));
  assert.equal(serialized.order, 1);

  const visit = (node) => {
    assert.equal(node.keys.length, node.numKeys);
    if (node.isLeaf) {
      assert.equal(node.pointers.length, 0);
      assert.equal(node.postings.length, node.numKeys);
      return;
    }
    assert.equal(Object.hasOwn(node, "postings"), false);
    assert.equal(node.pointers.length, node.numKeys + 1);
    for (const child of node.pointers) visit(child);
  };
  visit(serialized.root);
  assert.deepEqual(serialized.root.keys, tree.root.keys.slice(0, tree.root.numKeys));
});

test("deserializes serialized leaf posting lists for exact search", () => {
  const tree = new StringBTree(1);
  for (let index = 0; index < 12; index += 1) {
    const key = `term${String(index).padStart(2, "0")}`;
    tree.insert(key, { page: 2, position: index, ordinal: index });
    tree.insert(key, { page: 2, position: index + 20, ordinal: index + 20 });
  }

  const restored = StringBTree.deserialize(JSON.parse(JSON.stringify(tree.serialize())));
  for (let index = 0; index < 12; index += 1) {
    const key = `term${String(index).padStart(2, "0")}`;
    assert.deepEqual(restored.search(key), tree.search(key));
  }
  assert.equal(restored.search("not-found"), null);
  assert.notEqual(restored.root, tree.root);
});

test("serializes and restores leaf next links", () => {
  const tree = new StringBTree(1);
  const keys = [
    "app", "apple", "application", "apply", "apt",
    "banana", "band", "bandana", "cat", "dog"
  ];
  for (const [index, key] of keys.entries()) {
    tree.insert(key, { page: 1, position: index, ordinal: index });
  }

  const collectLeaves = (node, leaves = []) => {
    if (node.isLeaf) {
      leaves.push(node);
      return leaves;
    }
    for (let index = 0; index <= node.numKeys; index += 1) {
      collectLeaves(node.pointers[index], leaves);
    }
    return leaves;
  };
  const collectSerializedLeaves = (node, leaves = []) => {
    if (node.isLeaf) {
      leaves.push(node);
      return leaves;
    }
    for (const child of node.pointers) collectSerializedLeaves(child, leaves);
    return leaves;
  };

  const serialized = JSON.parse(JSON.stringify(tree.serialize()));
  const restored = StringBTree.deserialize(serialized);
  const originalLeaves = collectLeaves(tree.root);
  const restoredLeaves = collectLeaves(restored.root);
  const serializedLeaves = collectSerializedLeaves(serialized.root);

  assert.ok(originalLeaves.length > 1);
  assert.deepEqual(
    serializedLeaves.map((leaf) => leaf.nextLeaf),
    originalLeaves.slice(1).map((leaf) => leaf.keys[0]).concat(null)
  );
  assert.deepEqual(
    originalLeaves.map((leaf) => leaf.nextLeaf?.keys[0] ?? null),
    originalLeaves.slice(1).map((leaf) => leaf.keys[0]).concat(null)
  );
  assert.deepEqual(
    restoredLeaves.map((leaf) => leaf.nextLeaf?.keys[0] ?? null),
    originalLeaves.slice(1).map((leaf) => leaf.keys[0]).concat(null)
  );

  for (const prefix of ["app", "ban", "band", "z", ""]) {
    const expected = keys
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key, postings: tree.search(key) }));
    assert.deepEqual(tree.prefixSearch(prefix), expected);
    assert.deepEqual(restored.prefixSearch(prefix), expected);
  }
});

test("stores token ordinals with character positions", () => {
  const tree = new StringBTree(2);
  tree.insert("word", { page: 1, position: 12, ordinal: 4 });

  assert.deepEqual(tree.search("word"), [
    { page: 1, positions: [12], ordinals: [4] }
  ]);
});
