(function exposeStringBTree(global) {
  class Node {
    constructor(isLeaf, order) {
      this.keys = new Array(2 * order + 1).fill(null);
      this.values = new Array(2 * order + 1).fill(null);
      this.pointers = new Array(2 * order + 2).fill(null);
      this.isLeaf = isLeaf;
      this.numKeys = 0;
    }
  }

  class StringBTree {
    constructor(order = 2) {
      if (!Number.isInteger(order) || order < 1) {
        throw new RangeError("B-tree order must be a positive integer.");
      }
      this.order = order;
      this.root = null;
    }

    findIdx(start, end, value, keys) {
      while (start <= end) {
        const mid = Math.floor(start + (end - start) / 2);
        if (keys[mid] < value) {
          start = mid + 1;
        } else {
          end = mid - 1;
        }
      }
      return start;
    }

    insert(key, posting) {
      if (typeof key !== "string" || key.length === 0) {
        throw new TypeError("B-tree keys must be non-empty strings.");
      }

      if (this.root === null) {
        this.root = new Node(true, this.order);
        this._insertEntry(this.root, 0, key, posting);
        return;
      }

      const split = this._insert(this.root, key, posting);
      if (split) {
        const newRoot = new Node(false, this.order);
        this._insertEntry(newRoot, 0, split.key, split.values);
        newRoot.pointers[0] = this.root;
        newRoot.pointers[1] = split.right;
        this.root = newRoot;
      }
    }

    search(key) {
      if (typeof key !== "string") return null;
      const entry = this._findEntry(key);
      return entry ? entry.values : null;
    }

    prefixSearch(prefix) {
      if (typeof prefix !== "string" || prefix.length === 0 || this.root === null) {
        return [];
      }

      const matches = [];
      const visit = (node) => {
        let i = this.findIdx(0, node.numKeys - 1, prefix, node.keys);
        for (; i < node.numKeys; i += 1) {
          if (!node.isLeaf) visit(node.pointers[i]);
          if (!node.keys[i].startsWith(prefix)) return;
          matches.push({ key: node.keys[i], values: node.values[i] });
        }
        if (!node.isLeaf) visit(node.pointers[i]);
      };
      visit(this.root);
      return matches;
    }

    serialize() {
      return {
        order: this.order,
        root: this._serializeNode(this.root)
      };
    }

    static deserialize(data) {
      if (!data || !Number.isInteger(data.order) || data.order < 1 || !data.root) {
        throw new TypeError("Stored B-tree data is invalid.");
      }

      const tree = new StringBTree(data.order);
      tree.root = StringBTree._deserializeNode(data.root, data.order);
      return tree;
    }

    static _deserializeNode(data, order) {
      if (
        !data ||
        typeof data.isLeaf !== "boolean" ||
        !Array.isArray(data.keys) ||
        !Array.isArray(data.values) ||
        !Array.isArray(data.pointers) ||
        !Number.isInteger(data.numKeys) ||
        data.numKeys < 1 ||
        data.numKeys > 2 * order ||
        data.keys.length !== data.numKeys ||
        data.values.length !== data.numKeys ||
        data.pointers.length !== (data.isLeaf ? 0 : data.numKeys + 1)
      ) {
        throw new TypeError("Stored B-tree node is invalid.");
      }

      const node = new Node(data.isLeaf, order);
      for (let i = 0; i < data.numKeys; i += 1) {
        if (
          typeof data.keys[i] !== "string" ||
          (i > 0 && data.keys[i - 1] >= data.keys[i]) ||
          !Array.isArray(data.values[i]) ||
          !data.values[i].every(
            (posting) =>
              Number.isInteger(posting?.page) &&
              posting.page > 0 &&
              Array.isArray(posting.positions) &&
              Array.isArray(posting.lengths) &&
              posting.lengths.length === posting.positions.length &&
              posting.positions.every((position) => Number.isInteger(position) && position >= 0) &&
              posting.lengths.every((length) => Number.isInteger(length) && length > 0)
          )
        ) {
          throw new TypeError("Stored B-tree keys or postings are invalid.");
        }
        node.keys[i] = data.keys[i];
        node.values[i] = data.values[i];
      }
      node.numKeys = data.numKeys;

      if (!data.isLeaf) {
        node.pointers = data.pointers.map((child) => StringBTree._deserializeNode(child, order));
      }
      return node;
    }

    _serializeNode(node) {
      if (node === null) return null;
      return {
        isLeaf: node.isLeaf,
        numKeys: node.numKeys,
        keys: node.keys.slice(0, node.numKeys),
        values: node.values.slice(0, node.numKeys),
        pointers: node.isLeaf
          ? []
          : node.pointers.slice(0, node.numKeys + 1).map((child) => this._serializeNode(child))
      };
    }

    _findEntry(key) {
      let node = this.root;
      while (node !== null) {
        const index = this.findIdx(0, node.numKeys - 1, key, node.keys);
        if (index < node.numKeys && node.keys[index] === key) {
          return { node, index, values: node.values[index] };
        }
        if (node.isLeaf) return null;
        node = node.pointers[index];
      }
      return null;
    }

    _insert(node, key, posting) {
      const index = this.findIdx(0, node.numKeys - 1, key, node.keys);
      if (index < node.numKeys && node.keys[index] === key) {
        if (posting !== null && posting !== undefined) {
          this._appendPosting(node.values[index], posting, key.length);
        }
        return null;
      }

      if (node.isLeaf) {
        this._insertEntry(node, index, key, posting);
      } else {
        const split = this._insert(node.pointers[index], key, posting);
        if (split) {
          this._insertEntry(node, index, split.key, split.values);
          node.pointers[index + 1] = split.right;
        }
      }

      if (node.numKeys <= 2 * this.order) return null;
      return this._split(node);
    }

    _insertEntry(node, index, key, values) {
      for (let i = node.numKeys; i > index; i -= 1) {
        node.keys[i] = node.keys[i - 1];
        node.values[i] = node.values[i - 1];
      }
      if (!node.isLeaf) {
        for (let i = node.numKeys + 1; i > index + 1; i -= 1) {
          node.pointers[i] = node.pointers[i - 1];
        }
      }
      node.keys[index] = key;
      node.values[index] = Array.isArray(values) ? values : [];
      if (values !== null && values !== undefined && !Array.isArray(values)) {
        this._appendPosting(node.values[index], values, key.length);
      }
      node.numKeys += 1;
    }

    _appendPosting(postings, posting, termLength) {
      if (
        Number.isInteger(posting?.page) &&
        posting.page > 0 &&
        Number.isInteger(posting.position) &&
        posting.position >= 0
      ) {
        const length =
          Number.isInteger(posting.end) && posting.end > posting.position
            ? posting.end - posting.position
            : termLength;
        const lastPosting = postings[postings.length - 1];
        if (
          lastPosting?.page === posting.page &&
          Array.isArray(lastPosting.positions) &&
          Array.isArray(lastPosting.lengths)
        ) {
          lastPosting.positions.push(posting.position);
          lastPosting.lengths.push(length);
        } else {
          postings.push({
            page: posting.page,
            positions: [posting.position],
            lengths: [length]
          });
        }
        return;
      }
      postings.push(posting);
    }

    _split(node) {
      const middle = Math.floor(node.numKeys / 2);
      const right = new Node(node.isLeaf, this.order);
      const promoted = { key: node.keys[middle], values: node.values[middle] };

      for (let i = middle + 1; i < node.numKeys; i += 1) {
        const target = i - middle - 1;
        right.keys[target] = node.keys[i];
        right.values[target] = node.values[i];
        right.numKeys += 1;
      }

      if (!node.isLeaf) {
        for (let i = middle + 1; i <= node.numKeys; i += 1) {
          right.pointers[i - middle - 1] = node.pointers[i];
        }
      }

      for (let i = middle; i < node.numKeys; i += 1) {
        node.keys[i] = null;
        node.values[i] = null;
      }
      if (!node.isLeaf) {
        for (let i = middle + 1; i <= 2 * this.order + 1; i += 1) {
          node.pointers[i] = null;
        }
      }
      node.numKeys = middle;
      return { ...promoted, right };
    }
  }

  global.StringBTree = StringBTree;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = StringBTree;
  }
})(globalThis);
