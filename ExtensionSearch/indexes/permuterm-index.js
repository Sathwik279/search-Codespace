(function exposePermutermIndex(global) {
  const StringBTree =
    global.StringBTree ||
    (typeof require === "function" ? require("./btree.js") : null);
  const SERIALIZATION_VERSION = 1;
  const TERM_PATTERN = /^[a-z0-9]+$/;

  function getRotations(term) {
    if (typeof term !== "string" || !TERM_PATTERN.test(term)) {
      throw new TypeError("Permuterm terms must contain lowercase ASCII letters and digits.");
    }

    let terminatedTerm = `${term}$`;
    const rotations = [];
    for (let index = 0; index < terminatedTerm.length; index += 1) {
      rotations.push(terminatedTerm);
      terminatedTerm = terminatedTerm.slice(1) + terminatedTerm[0];
    }
    return rotations;
  }

  class PermutermIndex {
    constructor(order = 2) {
      this.tree = new StringBTree(order);
      this.termByRotation = new Map();
    }

    addTerm(term) {
      for (const rotation of getRotations(term)) {
        const existingTerm = this.termByRotation.get(rotation);
        if (existingTerm !== undefined && existingTerm !== term) {
          throw new Error("Permuterm rotation maps to more than one term.");
        }
        if (existingTerm === undefined) {
          this.tree.insert(rotation);
          this.termByRotation.set(rotation, term);
        }
      }
    }

    prefixSearch(prefix) {
      if (typeof prefix !== "string") {
        throw new TypeError("Permuterm prefix must be a string.");
      }

      return this.tree.prefixSearch(prefix).map(({ key }) => {
        const term = this.termByRotation.get(key);
        if (term === undefined) {
          throw new TypeError("Permuterm index is missing a rotation mapping.");
        }
        return { key, term };
      });
    }

    serialize() {
      return {
        version: SERIALIZATION_VERSION,
        tree: this.tree.serialize(),
        termByRotation: Array.from(this.termByRotation)
      };
    }

    static deserialize(data) {
      if (
        !data ||
        data.version !== SERIALIZATION_VERSION ||
        !Array.isArray(data.termByRotation)
      ) {
        throw new TypeError("Stored permuterm index is invalid.");
      }

      const index = new PermutermIndex();
      index.tree = StringBTree.deserialize(data.tree);
      for (const entry of data.termByRotation) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          typeof entry[0] !== "string" ||
          typeof entry[1] !== "string" ||
          !getRotations(entry[1]).includes(entry[0]) ||
          index.termByRotation.has(entry[0])
        ) {
          throw new TypeError("Stored permuterm rotation mapping is invalid.");
        }
        index.termByRotation.set(entry[0], entry[1]);
      }

      const treeKeys = [];
      const collectKeys = (node) => {
        if (node.isLeaf) {
          treeKeys.push(...node.keys.slice(0, node.numKeys));
          return;
        }
        for (const child of node.pointers) collectKeys(child);
      };
      if (index.tree.root !== null) collectKeys(index.tree.root);
      if (
        treeKeys.length !== index.termByRotation.size ||
        treeKeys.some((key) => !index.termByRotation.has(key))
      ) {
        throw new TypeError("Stored permuterm keys and rotation mappings do not match.");
      }

      return index;
    }
  }

  global.PermutermIndex = PermutermIndex;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = PermutermIndex;
  }
})(globalThis);
