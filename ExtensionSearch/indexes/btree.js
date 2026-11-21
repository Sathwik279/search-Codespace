class Node {

    constructor(isLeaf = true, order = 2) {
        if (new.target === Node) {
            return isLeaf ? new LeafNode(order) : new InternalNode(order);
        }
        this.isLeaf = isLeaf;
        this.order = order;
        // Allocate one extra key slot so a node can overflow before splitting.
        this.keys = new Array(2 * order + 1).fill(null);
        this.numKeys = 0;
    }

}

class InternalNode extends Node {

    constructor(order = 2) {
        super(false, order);
        this.pointers = new Array(2 * order + 2).fill(null);
        this.postings = null;
    }

}

class LeafNode extends Node {

    constructor(order = 2) {
        super(true, order);
        this.postings = new Array(2 * order + 1).fill(null);
        this.pointers = null;
        this.nextLeaf = null;
    }

}

class StringBTree {

    constructor(order = 2) {
        this.order = order;
        this.root = null;
    }

    // Returns the first index whose key is greater than or equal to the search value.
    // you can also see the same function like it finds the first insertion index if the element is not present in the array.
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

        let currNode = isLeaf ? new LeafNode(this.order) : new InternalNode(this.order);
        currNode.keys[0] = insVal;
        if (isLeaf) currNode.postings[0] = [];
        currNode.numKeys = 1;
        return currNode;
    }

    initNodeFromSlice(node, start, end, isLeaf) {

        let currNode = isLeaf ? new LeafNode(this.order) : new InternalNode(this.order);

        for (let i = start; i <= end; i++) {
            currNode.keys[i - start] = node.keys[i];
            if (isLeaf) currNode.postings[i - start] = node.postings[i];
            currNode.numKeys++;
        }

        if (!isLeaf) {
            for (let i = start; i <= end + 1; i++) {
                currNode.pointers[i - start] = node.pointers[i];
            }
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

        if (!node.isLeaf) {
            for (let i = node.numKeys; i >= idx + 1; i--) {
                node.pointers[i + 1] = node.pointers[i];
            }
            if (pointer !== null) {
                node.pointers[idx + 1] = pointer;
            }
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
        if (!node.isLeaf) {
            for (let i = start; i <= end + 1; i++) {
                node.pointers[i] = null;
            }
        }
    }

    _insert(currNode, insVal, posting) {

        let node = currNode;

        // Root is leaf and needs splitting
        if (node.isLeaf && this.root === currNode) {

            // if there is space

                // here in this if case the insVal is already there we need to append the posting thats it
            let idx = this.lowerBound(0, node.numKeys - 1, insVal, node.keys);
            if (idx < node.numKeys && node.keys[idx] === insVal) { 
                this._appendPosting(node.postings[idx], posting);
                return { retInsVal: null, retNode: null };
            }

                // this insertIntoNode has appendPostings seperate before that we need to insert the insVal
            if (node.numKeys < 2 * this.order) {
                this.insertIntoNode(node, insVal, -1, null, posting);
                return { retInsVal: null, retNode: null };
            }

            // if there is no space

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

            // if there is space

                // here in this if case the insVal is already there we need to append the posting thats it
            if (idx < node.numKeys && node.keys[idx] === insVal) {
                this._appendPosting(node.postings[idx], posting);
                return { retInsVal: null, retNode: null };
            }
                // this insertIntoNode has appendPostings seperate before that we need to insert the insVal
            if (node.numKeys < 2 * this.order) {
                this.insertIntoNode(node, insVal, idx, null, posting);
                return { retInsVal: null, retNode: null };
            }

            // if there is no space

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
        

        // this is the core selection tranversal
        // if equals go right(idx+1) else go left(same idx)
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

            // this case if when we came till the root splitting the below nodes but in root also no space is there
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
                    return curr.postings[idx].map((posting) => ({
                        page: posting.page,
                        positions: Array.from(posting.positions),
                        ordinals: Array.from(posting.ordinals)
                    }));
                }
                return null;
            }

            // if equals go right(idx+1) else go left(same idx)
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

        // this part will go the first node which is starting with the given string or prefix
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

        // this is the horizontal scan till we get a match of prefix 
        const matches = [];
        while (curr !== null) {

            for (let index = keyIdx; index < curr.numKeys; index += 1) {
                const key = curr.keys[index];
                if (!key.startsWith(prefix)) return matches;
                matches.push({
                    key,
                    postings: curr.postings[index].map((posting) => ({
                        page: posting.page,
                        positions: Array.from(posting.positions),
                        ordinals: Array.from(posting.ordinals)
                    }))
                });
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
                    .map((postingList) => StringBTree._encodePostingList(postingList));
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

        const node = data.isLeaf ? new LeafNode(order) : new InternalNode(order);
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
                !data.postings.every((postingList) => {
                    return postingList?.encoding === "delta" &&
                        Array.isArray(postingList.data) &&
                        Number.isInteger(postingList.count) &&
                        postingList.count >= 0;
                })
            ) {
                throw new TypeError("Stored B-tree postings are invalid.");
            }
            node.postings = data.postings.map((postingList) =>
                StringBTree._decodePostingList(postingList)
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
                lastPosting.positions instanceof Uint32Array &&
                lastPosting.ordinals instanceof Uint32Array
            ) {
                const positions = new Uint32Array(lastPosting.positions.length + 1);
                positions.set(lastPosting.positions);
                positions[positions.length - 1] = posting.position;
                const ordinals = new Uint32Array(lastPosting.ordinals.length + 1);
                ordinals.set(lastPosting.ordinals);
                ordinals[ordinals.length - 1] = posting.ordinal;
                lastPosting.positions = positions;
                lastPosting.ordinals = ordinals;
            } else {
                postings.push({
                    page: posting.page,
                    positions: Uint32Array.of(posting.position),
                    ordinals: Uint32Array.of(posting.ordinal)
                });
            }
            return;
        }
        throw new TypeError("Posting must include a positive page and nonnegative position and ordinal.");
    }

    static _encodePostingList(postingList) {
        const data = [];
        let previousPage = 0;
        for (const posting of postingList) {
            if (!Number.isInteger(posting.page) || posting.page <= previousPage) {
                throw new TypeError("Posting pages must be positive and ordered.");
            }
            data.push(posting.page - previousPage);
            previousPage = posting.page;
            data.push(posting.positions.length);
            let previousPosition = 0;
            for (const position of posting.positions) {
                if (!Number.isInteger(position) || position < previousPosition) {
                    throw new TypeError("Posting positions must be nonnegative and ordered.");
                }
                data.push(position - previousPosition);
                previousPosition = position;
            }
            let previousOrdinal = 0;
            for (const ordinal of posting.ordinals) {
                if (!Number.isInteger(ordinal) || ordinal < previousOrdinal) {
                    throw new TypeError("Posting ordinals must be nonnegative and ordered.");
                }
                data.push(ordinal - previousOrdinal);
                previousOrdinal = ordinal;
            }
        }
        return {
            encoding: "delta",
            data,
            count: postingList.length
        };
    }

    static _decodePostingList(serialized) {
        if (
            serialized?.encoding !== "delta" ||
            !Array.isArray(serialized.data)
        ) {
            throw new TypeError("Stored B-tree postings are invalid.");
        }
        if (!Number.isInteger(serialized.count) || serialized.count < 0) {
            throw new TypeError("Stored delta posting data is invalid.");
        }
        const postings = [];
        let dataIndex = 0;
        let previousPage = 0;
        for (let group = 0; group < serialized.count; group += 1) {
            if (dataIndex + 2 > serialized.data.length) {
                throw new TypeError("Stored delta posting data is invalid.");
            }
            const pageDelta = serialized.data[dataIndex++];
            const valueCount = serialized.data[dataIndex++];
            if (
                !Number.isInteger(pageDelta) ||
                pageDelta <= 0 ||
                !Number.isInteger(valueCount) ||
                valueCount < 0 ||
                valueCount > 0xffffffff
            ) {
                throw new TypeError("Stored delta posting data is invalid.");
            }
            const page = previousPage + pageDelta;
            if (page > 0xffffffff) {
                throw new TypeError("Stored delta posting data is invalid.");
            }
            const positions = new Uint32Array(valueCount);
            const ordinals = new Uint32Array(valueCount);
            let previousPosition = 0;
            let previousOrdinal = 0;
            for (let index = 0; index < valueCount; index += 1) {
                if (dataIndex >= serialized.data.length) {
                    throw new TypeError("Stored delta posting data is invalid.");
                }
                const positionDelta = serialized.data[dataIndex++];
                if (!Number.isInteger(positionDelta) || positionDelta < 0) {
                    throw new TypeError("Stored delta posting data is invalid.");
                }
                previousPosition += positionDelta;
                if (previousPosition > 0xffffffff) {
                    throw new TypeError("Stored delta posting data is invalid.");
                }
                positions[index] = previousPosition;
            }
            for (let index = 0; index < valueCount; index += 1) {
                if (dataIndex >= serialized.data.length) {
                    throw new TypeError("Stored delta posting data is invalid.");
                }
                const ordinalDelta = serialized.data[dataIndex++];
                if (!Number.isInteger(ordinalDelta) || ordinalDelta < 0) {
                    throw new TypeError("Stored delta posting data is invalid.");
                }
                previousOrdinal += ordinalDelta;
                if (previousOrdinal > 0xffffffff) {
                    throw new TypeError("Stored delta posting data is invalid.");
                }
                ordinals[index] = previousOrdinal;
            }
            postings.push({ page, positions, ordinals });
            previousPage = page;
        }
        if (dataIndex !== serialized.data.length) {
            throw new TypeError("Stored delta posting data is invalid.");
        }
        return postings;
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
                if (!currNode.isLeaf && currNode.pointers) {
                    for (let j = 0; j <= currNode.numKeys; j++) {
                        if (currNode.pointers[j] !== null) {
                            dq.push(currNode.pointers[j]);
                        }
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

StringBTree.Node = Node;
StringBTree.InternalNode = InternalNode;
StringBTree.LeafNode = LeafNode;

if (typeof module !== "undefined" && module.exports) {
    module.exports = StringBTree;
}
if (typeof globalThis !== "undefined") {
    globalThis.StringBTree = StringBTree;
    globalThis.BTreeNode = Node;
    globalThis.InternalNode = InternalNode;
    globalThis.LeafNode = LeafNode;
}
