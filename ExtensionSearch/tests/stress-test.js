const { performance } = require("node:perf_hooks");
const StringBTree = require("../indexes/btree.js");
const PermutermIndex = require("../indexes/permuterm-index.js");
const TrigramIndex = require("../search/trigram-index.js");
const SearchIndexBuilder = require("../search/index-builder.js");
const SearchQueryExecutor = require("../search/query-executor.js");

// Diverse realistic vocabulary to test realistic dictionary scaling
const BASE_WORDS = [
  "algorithm", "database", "retrieval", "inverted", "index", "compression",
  "document", "query", "boolean", "vector", "space", "model", "relevance",
  "scoring", "frequency", "posting", "permutation", "wildcard", "trigram",
  "jaccard", "levenshtein", "distance", "ranking", "evaluation", "precision",
  "recall", "clustering", "classification", "crawling", "tokenization",
  "computer", "system", "memory", "storage", "performance", "optimization",
  "latency", "throughput", "bandwidth", "distributed", "parallel", "search",
  "information", "architecture", "structure", "execution", "pipeline", "compiler",
  "runtime", "garbage", "collection", "allocation", "pointer", "reference"
];

// Generate synthetic vocabulary variants to simulate a realistic dictionary of 20,000+ distinct words
const FULL_VOCABULARY = [];
for (const base of BASE_WORDS) {
  FULL_VOCABULARY.push(base);
  for (let i = 1; i <= 350; i++) {
    FULL_VOCABULARY.push(`${base}${i}`);
  }
}

function generateStressCorpus(pageCount, wordsPerPage = 350) {
  const pages = [];
  let totalChars = 0;
  for (let p = 0; p < pageCount; p++) {
    const pageWords = [];
    for (let w = 0; w < wordsPerPage; w++) {
      const idx = Math.floor(Math.random() * FULL_VOCABULARY.length);
      pageWords.push(FULL_VOCABULARY[idx]);
    }
    const pageStr = pageWords.join(" ");
    totalChars += pageStr.length;
    pages.push(pageStr);
  }
  return { pages, totalChars };
}

function simulateChromeFind(pageTexts, query) {
  const q = query.toLowerCase();
  let matches = 0;
  for (let p = 0; p < pageTexts.length; p++) {
    const text = pageTexts[p];
    let pos = text.indexOf(q);
    while (pos !== -1) {
      matches++;
      pos = text.indexOf(q, pos + 1);
    }
  }
  return matches;
}

async function runStressAndLimits() {
  const tiers = [
    { name: "Small Paper", pages: 20, wordsPerPage: 350 },
    { name: "Medium Report", pages: 100, wordsPerPage: 350 },
    { name: "Standard Textbook", pages: 500, wordsPerPage: 400 },
    { name: "Large Corpus", pages: 1500, wordsPerPage: 400 },
    { name: "Extreme Stress Fixture", pages: 6000, wordsPerPage: 350 }
  ];

  const results = [];

  for (const tier of tiers) {
    if (global.gc) global.gc();
    const memBaseline = process.memoryUsage();

    const t0Gen = performance.now();
    const { pages, totalChars } = generateStressCorpus(tier.pages, tier.wordsPerPage);
    const genTime = performance.now() - t0Gen;
    const rawTextMB = (totalChars / (1024 * 1024)).toFixed(2);

    const memAfterGen = process.memoryUsage();
    const rawTextHeapMB = ((memAfterGen.heapUsed - memBaseline.heapUsed) / (1024 * 1024)).toFixed(2);

    // Measure Index Building
    const t0Build = performance.now();
    const buildResult = await SearchIndexBuilder.build(pages);
    const indexTimeMs = performance.now() - t0Build;

    const memAfterBuild = process.memoryUsage();
    const totalHeapUsedMB = (memAfterBuild.heapUsed / (1024 * 1024)).toFixed(2);
    const indexHeapDeltaMB = ((memAfterBuild.heapUsed - memAfterGen.heapUsed) / (1024 * 1024)).toFixed(2);
    const totalRssMB = (memAfterBuild.rss / (1024 * 1024)).toFixed(2);

    // Serialization Measurement (IndexedDB Storage Size)
    const t0Ser = performance.now();
    const serTerms = JSON.stringify(buildResult.index.serialize());
    const serPerm = JSON.stringify(buildResult.permutermIndex.serialize());
    const serTrig = JSON.stringify(buildResult.trigramIndex.serialize());
    const serTimeMs = performance.now() - t0Ser;

    const termsSizeKB = (serTerms.length / 1024).toFixed(2);
    const permSizeKB = (serPerm.length / 1024).toFixed(2);
    const trigSizeKB = (serTrig.length / 1024).toFixed(2);
    const totalStorageMB = ((serTerms.length + serPerm.length + serTrig.length) / (1024 * 1024)).toFixed(2);

    // Query Latency Benchmark (10 queries, 10 runs each)
    const testQueries = ["algorithm", "database", "retrieval", "vector", "search"];
    let chromeTotalTime = 0;
    let btreeTotalTime = 0;
    const testRuns = 20;

    for (const q of testQueries) {
      for (let i = 0; i < testRuns; i++) {
        const t0C = performance.now();
        simulateChromeFind(pages, q);
        chromeTotalTime += (performance.now() - t0C);

        const t0B = performance.now();
        SearchQueryExecutor.search(buildResult.index, buildResult.permutermIndex, pages, q);
        btreeTotalTime += (performance.now() - t0B);
      }
    }

    const avgChromeMs = (chromeTotalTime / (testQueries.length * testRuns)).toFixed(3);
    const avgBtreeMs = (btreeTotalTime / (testQueries.length * testRuns)).toFixed(3);

    const record = {
      tier: tier.name,
      pages: tier.pages,
      words: buildResult.indexedWordCount,
      chars: totalChars,
      rawTextMB: Number(rawTextMB),
      indexTimeMs: Number(indexTimeMs.toFixed(1)),
      serializationTimeMs: Number(serTimeMs.toFixed(1)),
      rawTextHeapMB: Number(rawTextHeapMB),
      indexHeapDeltaMB: Number(indexHeapDeltaMB),
      totalHeapUsedMB: Number(totalHeapUsedMB),
      totalRssMB: Number(totalRssMB),
      storageTermsKB: Number(termsSizeKB),
      storagePermKB: Number(permSizeKB),
      storageTrigKB: Number(trigSizeKB),
      totalStorageMB: Number(totalStorageMB),
      avgChromeMs: Number(avgChromeMs),
      avgBtreeMs: Number(avgBtreeMs)
    };

    results.push(record);
    console.log(`[DONE] ${tier.name}: ${tier.pages} pages, ${record.words.toLocaleString()} words, Build: ${record.indexTimeMs}ms, Chrome: ${record.avgChromeMs}ms, BTree: ${record.avgBtreeMs}ms, Storage: ${record.totalStorageMB}MB, RSS: ${record.totalRssMB}MB`);
  }

  console.log("\nFULL_RESULTS_JSON:" + JSON.stringify(results));
}

runStressAndLimits().catch(console.error);
