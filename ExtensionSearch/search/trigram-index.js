(function exposeTrigramIndex(global) {
  const SERIALIZATION_VERSION = 1;
  const TERM_PATTERN = /^[a-z0-9]+$/;

  function getNgrams(term, n) {
    const paddedTerm = `^${"^".repeat(n - 2)}${term}$`;
    const ngrams = new Set();
    for (let index = 0; index <= paddedTerm.length - n; index += 1) {
      ngrams.add(paddedTerm.slice(index, index + n));
    }
    return ngrams;
  }

  function getJaccardCoefficient(left, right) {
    let intersectionSize = 0;
    for (const value of left) {
      if (right.has(value)) intersectionSize += 1;
    }
    const unionSize = left.size + right.size - intersectionSize;
    return unionSize === 0 ? 1 : intersectionSize / unionSize;
  }

  class TrigramIndex {
    constructor() {
      this.termsByNgram = new Map();
    }

    addTerm(term) {
      if (typeof term !== "string" || !TERM_PATTERN.test(term)) {
        throw new TypeError("Trigram terms must contain lowercase ASCII letters and digits.");
      }

      for (const ngram of getNgrams(term, 3)) {
        let terms = this.termsByNgram.get(ngram);
        if (!terms) {
          terms = new Set();
          this.termsByNgram.set(ngram, terms);
        }
        terms.add(term);
      }
    }

    findCandidates(term, minimumJaccard = 0.2) {
      if (typeof term !== "string" || !TERM_PATTERN.test(term)) {
        throw new TypeError("Trigram queries must contain lowercase ASCII letters and digits.");
      }
      if (typeof minimumJaccard !== "number" || minimumJaccard < 0 || minimumJaccard > 1) {
        throw new TypeError("Minimum Jaccard coefficient must be between 0 and 1.");
      }

      const queryNgrams = getNgrams(term, 3);
      const candidateTerms = new Set();
      for (const ngram of queryNgrams) {
        for (const candidate of this.termsByNgram.get(ngram) || []) {
          candidateTerms.add(candidate);
        }
      }

      return Array.from(candidateTerms, (candidate) => ({
        term: candidate,
        jaccard: getJaccardCoefficient(queryNgrams, getNgrams(candidate, 3))
      }))
        .filter(({ jaccard }) => jaccard >= minimumJaccard)
        .sort((left, right) => right.jaccard - left.jaccard || left.term.localeCompare(right.term));
    }

    serialize() {
      return {
        version: SERIALIZATION_VERSION,
        n: 3,
        termsByNgram: Array.from(this.termsByNgram, ([ngram, terms]) => [
          ngram,
          Array.from(terms).sort()
        ])
      };
    }

    static deserialize(data) {
      if (
        !data ||
        data.version !== SERIALIZATION_VERSION ||
        data.n !== 3 ||
        !Array.isArray(data.termsByNgram)
      ) {
        throw new TypeError("Stored trigram index is invalid.");
      }

      const index = new TrigramIndex();
      for (const entry of data.termsByNgram) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          typeof entry[0] !== "string" ||
          !Array.isArray(entry[1]) ||
          !entry[1].every((term) => typeof term === "string" && TERM_PATTERN.test(term))
        ) {
          throw new TypeError("Stored trigram entry is invalid.");
        }
        for (const term of entry[1]) {
          if (!getNgrams(term, 3).has(entry[0])) {
            throw new TypeError("Stored trigram entry does not match its term.");
          }
          let terms = index.termsByNgram.get(entry[0]);
          if (!terms) {
            terms = new Set();
            index.termsByNgram.set(entry[0], terms);
          }
          terms.add(term);
        }
      }
      return index;
    }
  }

  global.TrigramIndex = TrigramIndex;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = TrigramIndex;
  }
})(globalThis);
