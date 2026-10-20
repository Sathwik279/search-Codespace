class Node {
    constructor(isLeaf = true, order = 2) {
        // Allocate one extra key slot so a node can overflow before splitting.
        this.keys = new Array(2 * order + 1).fill(null);
        this.postings = isLeaf ? new Array(2 * order + 1).fill(null) : null;
        this.pointers = new Array(2 * order + 2).fill(null);
        this.isLeaf = isLeaf;
        this.numKeys = 0;
        this.nextLeaf = null;
    }
}

class StringBTree {
    constructor(order = 2) {
        this.order = order;
        this.root = null;
    }

    // Returns the first index whose key is greater than or equal to the search value.
    lowerBound(start, end, searchVal, keys) {
        while (start <= end) {
            const mid = Math.floor(start + (end - start) / 2);
            if (keys[mid] < searchVal) {
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }
        return start;
    }

    initNode(insVal, isLeaf = true) {
        let currNode = new Node(isLeaf, this.order);
        currNode.keys[0] = insVal;
        if (isLeaf) currNode.postings[0] = [];
        currNode.numKeys = 1;
        return currNode;
    }

    initNodeFromSlice(node, start, end, isLeaf) {
        let currNode = new Node(isLeaf, this.order);
        for (let i = start; i <= end; i++) {
            currNode.keys[i - start] = node.keys[i];
            if (isLeaf) currNode.postings[i - start] = node.postings[i];
            currNode.numKeys++;
        }
        for (let i = start; i <= end + 1; i++) {
            currNode.pointers[i - start] = node.pointers[i];
        }
        return currNode;
    }

    insertIntoNode(node, insVal, insertionIdx, pointer, posting = null) {
        let idx = insertionIdx === -1
            ? this.lowerBound(0, node.numKeys - 1, insVal, node.keys)
            : insertionIdx;

        for (let i = node.numKeys - 1; i >= idx; i--) {
            node.keys[i + 1] = node.keys[i];
            if (node.isLeaf) node.postings[i + 1] = node.postings[i];
        }
        for (let i = node.numKeys; i >= idx + 1; i--) {
            node.pointers[i + 1] = node.pointers[i];
        }
        if (pointer !== null) {
            node.pointers[idx + 1] = pointer;
        }
        node.keys[idx] = insVal;
        if (node.isLeaf) {
            node.postings[idx] = [];
            if (posting !== null && posting !== undefined) {
                this._appendPosting(node.postings[idx], posting);
            }
        }
        node.numKeys++;
    }

    cleanUpStale(node, start, end) {
        for (let i = start; i <= end; i++) {
            node.keys[i] = null;
            if (node.isLeaf) node.postings[i] = null;
        }
    }

    _insert(currNode, insVal, posting) {
        let node = currNode;

        // Root is leaf and needs splitting
        if (node.isLeaf && this.root === currNode) {
            let idx = this.lowerBound(0, node.numKeys - 1, insVal, node.keys);
            if (idx < node.numKeys && node.keys[idx] === insVal) {
                this._appendPosting(node.postings[idx], posting);
                return { retInsVal: null, retNode: null };
            }
            if (node.numKeys < 2 * this.order) {
                this.insertIntoNode(node, insVal, -1, null, posting);
                return { retInsVal: null, retNode: null };
            }

            this.insertIntoNode(node, insVal, -1, null, posting);
            let upMid = Math.floor(node.numKeys / 2);
            let newRoot = this.initNode(node.keys[upMid], false);
            let newSibling = this.initNodeFromSlice(node, upMid, 2 * this.order, true);
            newSibling.nextLeaf = node.nextLeaf;
            node.nextLeaf = newSibling;
            this.cleanUpStale(node, upMid, 2 * this.order);
            node.numKeys = upMid;
            newRoot.pointers[0] = currNode;
            newRoot.pointers[1] = newSibling;
            this.root = newRoot;

            return { retInsVal: null, retNode: null };
        }

        // General leaf node insertion
        if (node.isLeaf) {
            let idx = this.lowerBound(0, node.numKeys - 1, insVal, node.keys);
            if (idx < node.numKeys && node.keys[idx] === insVal) {
                this._appendPosting(node.postings[idx], posting);
                return { retInsVal: null, retNode: null };
            }
            if (node.numKeys < 2 * this.order) {
                this.insertIntoNode(node, insVal, idx, null, posting);
                return { retInsVal: null, retNode: null };
            }

            this.insertIntoNode(node, insVal, idx, null, posting);
            let upMid = Math.floor(node.numKeys / 2);
            let newSibling = this.initNodeFromSlice(node, upMid, 2 * this.order, true);
            newSibling.isLeaf = true;
            newSibling.nextLeaf = node.nextLeaf;
            node.nextLeaf = newSibling;
            this.cleanUpStale(node, upMid, 2 * this.order);

            node.numKeys = upMid;
            return { retInsVal: newSibling.keys[0], retNode: newSibling };
        }

        // Internal node recursive traversal & splitting
        let recIdx = this.lowerBound(0, node.numKeys - 1, insVal, node.keys);
        if (recIdx < node.numKeys && node.keys[recIdx] === insVal) {
            recIdx += 1;
        }
        let res = this._insert(node.pointers[recIdx], insVal, posting);
        let retInsVal = res.retInsVal;
        let retNode = res.retNode;

        if (retNode !== null) {
            if (node.numKeys < 2 * this.order) {
                this.insertIntoNode(node, retInsVal, recIdx, retNode);
                return { retInsVal: null, retNode: null };
            }

            this.insertIntoNode(node, retInsVal, recIdx, retNode);
            let upMid = Math.floor(node.numKeys / 2);
            let newInsVal = node.keys[upMid];
            let newSibling = this.initNodeFromSlice(node, upMid + 1, 2 * this.order, false);
            newSibling.isLeaf = false;
            node.numKeys = upMid;

            if (currNode === this.root) {
                let newRoot = this.initNode(newInsVal, false);
                newRoot.pointers[0] = currNode;
                newRoot.pointers[1] = newSibling;
                this.root = newRoot;
                return { retInsVal: null, retNode: null };
            }
            return { retInsVal: newInsVal, retNode: newSibling };
        }

        return { retInsVal: null, retNode: null };
    }

    insert(insVal, posting) {
        if (
            posting !== null &&
            posting !== undefined &&
            (!Number.isInteger(posting?.page) ||
                posting.page < 1 ||
                !Number.isInteger(posting.position) ||
                posting.position < 0 ||
                !Number.isInteger(posting.ordinal) ||
                posting.ordinal < 0)
        ) {
            throw new TypeError("Posting must include a positive page and nonnegative position and ordinal.");
        }
        if (this.root === null) {
            this.root = this.initNode(insVal, true);
            if (posting !== null && posting !== undefined) {
                this._appendPosting(this.root.postings[0], posting);
            }
            return;
        }
        this._insert(this.root, insVal, posting);
    }

    // Search function for strings; returns the posting list or null.
    search(key) {
        let curr = this.root;
        while (curr !== null) {
            let idx = this.lowerBound(0, curr.numKeys - 1, key, curr.keys);
            if (curr.isLeaf) {
                if (idx < curr.numKeys && curr.keys[idx] === key) {
                    return curr.postings[idx];
                }
                return null;
            }
            if (idx < curr.numKeys && curr.keys[idx] === key) {
                idx += 1;
            }
            curr = curr.pointers[idx];
        }
        return null;
    }

    prefixSearch(prefix) {
        if (typeof prefix !== "string") {
            throw new TypeError("Prefix must be a string.");
        }

        let curr = this.root;
        while (curr !== null && !curr.isLeaf) {
            let idx = this.lowerBound(0, curr.numKeys - 1, prefix, curr.keys);
            if (idx < curr.numKeys && curr.keys[idx] === prefix) {
                idx += 1;
            }
            curr = curr.pointers[idx];
        }
        if (curr === null) return [];

        let keyIdx = this.lowerBound(0, curr.numKeys - 1, prefix, curr.keys);

        const matches = [];
        while (curr !== null) {
            for (let index = keyIdx; index < curr.numKeys; index += 1) {
                const key = curr.keys[index];
                if (!key.startsWith(prefix)) return matches;
                matches.push({ key, postings: curr.postings[index] });
            }
            curr = curr.nextLeaf;
            keyIdx = 0;
        }
        return matches;
    }

    serialize() {
        const serializeNode = (node) => {
            if (node === null) return null;

            const serializedNode = {
                isLeaf: node.isLeaf,
                numKeys: node.numKeys,
                keys: node.keys.slice(0, node.numKeys),
                pointers: node.isLeaf
                    ? []
                    : node.pointers
                        .slice(0, node.numKeys + 1)
                        .map(serializeNode)
            };
            if (node.isLeaf) {
                serializedNode.nextLeaf = node.nextLeaf === null ? null : node.nextLeaf.keys[0];
                serializedNode.postings = node.postings
                    .slice(0, node.numKeys)
                    .map((postingList) => postingList.map((posting) => ({
                        ...posting,
                        positions: Array.isArray(posting.positions)
                            ? posting.positions.slice()
                            : posting.positions,
                        ordinals: Array.isArray(posting.ordinals)
                            ? posting.ordinals.slice()
                            : posting.ordinals
                    })));
            }
            return serializedNode;
        };

        return {
            order: this.order,
            root: serializeNode(this.root)
        };
    }

    static deserialize(data) {
        if (!data || !Number.isInteger(data.order) || data.order < 1) {
            throw new TypeError("Stored B-tree data is invalid.");
        }

        const tree = new StringBTree(data.order);
        if (data.root !== null) {
            const leaves = [];
            tree.root = StringBTree._deserializeNode(data.root, data.order, leaves);
            for (let index = 0; index < leaves.length; index += 1) {
                const { node, nextLeaf } = leaves[index];
                const expectedNextKey = leaves[index + 1]?.node.keys[0] ?? null;
                if (nextLeaf !== undefined && nextLeaf !== expectedNextKey) {
                    throw new TypeError("Stored B-tree leaf links are invalid.");
                }
                node.nextLeaf = leaves[index + 1]?.node ?? null;
            }
        }
        return tree;
    }

    static _deserializeNode(data, order, leaves) {
        if (
            !data ||
            typeof data.isLeaf !== "boolean" ||
            !Number.isInteger(data.numKeys) ||
            data.numKeys < 1 ||
            data.numKeys > 2 * order ||
            !Array.isArray(data.keys) ||
            data.keys.length !== data.numKeys ||
            !data.keys.every(
                (key, index) =>
                    typeof key === "string" &&
                    key.length > 0 &&
                    (index === 0 || data.keys[index - 1] < key)
            ) ||
            !Array.isArray(data.pointers) ||
            data.pointers.length !== (data.isLeaf ? 0 : data.numKeys + 1)
        ) {
            throw new TypeError("Stored B-tree node is invalid.");
        }

        const node = new Node(data.isLeaf, order);
        node.numKeys = data.numKeys;
        for (let i = 0; i < data.numKeys; i += 1) {
            node.keys[i] = data.keys[i];
        }

        if (data.isLeaf) {
            if (
                Object.hasOwn(data, "nextLeaf") &&
                data.nextLeaf !== null &&
                (typeof data.nextLeaf !== "string" || data.nextLeaf.length === 0)
            ) {
                throw new TypeError("Stored B-tree leaf links are invalid.");
            }
            if (
                !Array.isArray(data.postings) ||
                data.postings.length !== data.numKeys ||
                !data.postings.every(
                    (postingList) =>
                        Array.isArray(postingList) &&
                        postingList.every(
                            (posting) =>
                                Number.isInteger(posting?.page) &&
                                posting.page > 0 &&
                                Array.isArray(posting.positions) &&
                                Array.isArray(posting.ordinals) &&
                                posting.ordinals.length === posting.positions.length &&
                                posting.positions.every(
                                    (position) => Number.isInteger(position) && position >= 0
                                ) &&
                                posting.ordinals.every(
                                    (ordinal) => Number.isInteger(ordinal) && ordinal >= 0
                                )
                        )
                )
            ) {
                throw new TypeError("Stored B-tree postings are invalid.");
            }
            node.postings = data.postings.map((postingList) =>
                postingList.map((posting) => ({
                    ...posting,
                    positions: posting.positions.slice(),
                    ordinals: posting.ordinals.slice()
                }))
            );
            leaves.push({ node, nextLeaf: data.nextLeaf });
        } else {
            if (Object.hasOwn(data, "postings") || Object.hasOwn(data, "nextLeaf")) {
                throw new TypeError("Stored internal B-tree nodes cannot have leaf data.");
            }
            node.pointers = data.pointers.map((child) =>
                StringBTree._deserializeNode(child, order, leaves)
            );
        }

        return node;
    }

    _appendPosting(postings, posting) {
        if (posting === null || posting === undefined) return;
        if (
            Number.isInteger(posting?.page) &&
            posting.page > 0 &&
            Number.isInteger(posting.position) &&
            posting.position >= 0 &&
            Number.isInteger(posting.ordinal) &&
            posting.ordinal >= 0
        ) {
            const lastPosting = postings[postings.length - 1];
            if (
                lastPosting?.page === posting.page &&
                Array.isArray(lastPosting.positions) &&
                Array.isArray(lastPosting.ordinals)
            ) {
                lastPosting.positions.push(posting.position);
                lastPosting.ordinals.push(posting.ordinal);
            } else {
                postings.push({
                    page: posting.page,
                    positions: [posting.position],
                    ordinals: [posting.ordinal]
                });
            }
            return;
        }
        throw new TypeError("Posting must include a positive page and nonnegative position and ordinal.");
    }

    printTree() {
        let dq = [];
        if (this.root === null) return;
        dq.push(this.root);

        while (dq.length > 0) {
            let dqSiz = dq.length;
            let levelOutput = "";
            for (let i = 0; i < dqSiz; i++) {
                let currNode = dq.shift();
                for (let j = 0; j <= currNode.numKeys; j++) {
                    if (currNode.pointers[j] !== null) {
                        dq.push(currNode.pointers[j]);
                    }
                }
                let validKeys = [];
                for (let j = 0; j < currNode.numKeys; j++) {
                    if (currNode.keys[j] !== null) validKeys.push(currNode.keys[j]);
                }
                levelOutput += "[" + validKeys.join(", ") + "] -- ";
            }
            console.log(levelOutput);
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = StringBTree;
}
if (typeof globalThis !== "undefined") {
    globalThis.StringBTree = StringBTree;
}
