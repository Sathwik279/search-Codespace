/**
 * compression-bench.js
 * Measures gzip-compressed storage size for each tier (after compression optimisation).
 * Uses Node's built-in zlib.gzip (identical algorithm to browser CompressionStream('gzip')).
 */

const { performance } = require("node:perf_hooks");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const gzip = promisify(zlib.gzip);

const SearchIndexBuilder = require("../search/index-builder.js");

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

const FULL_VOCABULARY = [];
for (const base of BASE_WORDS) {
  FULL_VOCABULARY.push(base);
  for (let i = 1; i <= 350; i++) FULL_VOCABULARY.push(`${base}${i}`);
}

function generateCorpus(pageCount, wordsPerPage = 350) {
  const pages = [];
  let totalChars = 0;
  for (let p = 0; p < pageCount; p++) {
    const words = [];
    for (let w = 0; w < wordsPerPage; w++) {
      words.push(FULL_VOCABULARY[Math.floor(Math.random() * FULL_VOCABULARY.length)]);
    }
    const s = words.join(" ");
    totalChars += s.length;
    pages.push(s);
  }
  return { pages, totalChars };
}

function simulateChromeFind(pageTexts, query) {
  const q = query.toLowerCase();
  let matches = 0;
  for (const text of pageTexts) {
    let pos = text.indexOf(q);
    while (pos !== -1) { matches++; pos = text.indexOf(q, pos + 1); }
  }
  return matches;
}

async function run() {
  const tiers = [
    { name: "Small Paper",          pages: 20,   wordsPerPage: 350 },
    { name: "Medium Report",        pages: 100,  wordsPerPage: 350 },
    { name: "Standard Textbook",    pages: 500,  wordsPerPage: 400 },
    { name: "Large Corpus",         pages: 1500, wordsPerPage: 400 },
    { name: "Extreme Stress",       pages: 6000, wordsPerPage: 350 },
  ];

  const results = [];

  for (const tier of tiers) {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    // --- Generate corpus ---
    const { pages, totalChars } = generateCorpus(tier.pages, tier.wordsPerPage);

    const memAfterGen = process.memoryUsage();
    const rawTextHeapMB = ((memAfterGen.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2);

    // --- Build index ---
    const t0Build = performance.now();
    const buildResult = await SearchIndexBuilder.build(pages);
    const indexTimeMs = (performance.now() - t0Build).toFixed(1);

    const memAfterBuild = process.memoryUsage();
    const totalHeapUsedMB = (memAfterBuild.heapUsed / (1024 * 1024)).toFixed(2);
    const totalRssMB      = (memAfterBuild.rss     / (1024 * 1024)).toFixed(2);
    const indexHeapMB     = ((memAfterBuild.heapUsed - memAfterGen.heapUsed) / (1024 * 1024)).toFixed(2);

    // --- Serialise (uncompressed JSON) ---
    const t0Ser = performance.now();
    const rawTerms = JSON.stringify(buildResult.index.serialize());
    const rawPerm  = JSON.stringify(buildResult.permutermIndex.serialize());
    const rawTrig  = JSON.stringify(buildResult.trigramIndex.serialize());
    const serTimeMs = (performance.now() - t0Ser).toFixed(1);

    const uncompTermsKB = (rawTerms.length / 1024).toFixed(2);
    const uncompPermKB  = (rawPerm.length  / 1024).toFixed(2);
    const uncompTrigKB  = (rawTrig.length  / 1024).toFixed(2);
    const uncompTotalMB = ((rawTerms.length + rawPerm.length + rawTrig.length) / (1024 * 1024)).toFixed(2);

    // --- Compress with gzip ---
    const t0Gz = performance.now();
    const combined = JSON.stringify({ terms: rawTerms, perm: rawPerm, trig: rawTrig });
    const gzBuf = await gzip(Buffer.from(combined, "utf8"), { level: 6 });
    const gzTimeMs = (performance.now() - t0Gz).toFixed(1);

    // Also compress per-component for breakdown
    const [gzTermsBuf, gzPermBuf, gzTrigBuf] = await Promise.all([
      gzip(Buffer.from(rawTerms, "utf8"), { level: 6 }),
      gzip(Buffer.from(rawPerm,  "utf8"), { level: 6 }),
      gzip(Buffer.from(rawTrig,  "utf8"), { level: 6 }),
    ]);

    const compTermsKB = (gzTermsBuf.length / 1024).toFixed(2);
    const compPermKB  = (gzPermBuf.length  / 1024).toFixed(2);
    const compTrigKB  = (gzTrigBuf.length  / 1024).toFixed(2);
    const compTotalMB = ((gzTermsBuf.length + gzPermBuf.length + gzTrigBuf.length) / (1024 * 1024)).toFixed(2);
    const ratio       = (Number(uncompTotalMB) / Number(compTotalMB)).toFixed(2);

    // --- Query latency ---
    const testQueries = ["algorithm", "database", "retrieval", "vector", "search"];
    let chromeTotalTime = 0, btreeTotalTime = 0;
    const runs = 20;
    for (const q of testQueries) {
      for (let i = 0; i < runs; i++) {
        const t0C = performance.now(); simulateChromeFind(pages, q); chromeTotalTime += performance.now() - t0C;
        const t0B = performance.now();
        const { SearchQueryExecutor } = (() => { try { return { SearchQueryExecutor: require("../search/query-executor.js") }; } catch { return { SearchQueryExecutor: null }; } })();
        if (SearchQueryExecutor) SearchQueryExecutor.search(buildResult.index, buildResult.permutermIndex, pages, q);
        btreeTotalTime += performance.now() - t0B;
      }
    }
    const avgChromeMs = (chromeTotalTime / (testQueries.length * runs)).toFixed(3);
    const avgBtreeMs  = (btreeTotalTime  / (testQueries.length * runs)).toFixed(3);

    const record = {
      tier: tier.name,
      pages: tier.pages,
      words: buildResult.indexedWordCount,
      chars: totalChars,
      indexTimeMs:    Number(indexTimeMs),
      serTimeMs:      Number(serTimeMs),
      gzTimeMs:       Number(gzTimeMs),
      rawTextHeapMB:  Number(rawTextHeapMB),
      indexHeapMB:    Number(indexHeapMB),
      totalHeapMB:    Number(totalHeapUsedMB),
      totalRssMB:     Number(totalRssMB),
      // Uncompressed
      uncompTermsKB:  Number(uncompTermsKB),
      uncompPermKB:   Number(uncompPermKB),
      uncompTrigKB:   Number(uncompTrigKB),
      uncompTotalMB:  Number(uncompTotalMB),
      // Compressed
      compTermsKB:    Number(compTermsKB),
      compPermKB:     Number(compPermKB),
      compTrigKB:     Number(compTrigKB),
      compTotalMB:    Number(compTotalMB),
      compressionRatio: Number(ratio),
      // Latency
      avgChromeMs:    Number(avgChromeMs),
      avgBtreeMs:     Number(avgBtreeMs),
    };

    results.push(record);

    console.log(
      `[DONE] ${tier.name}: ${tier.pages}p | ` +
      `Build: ${indexTimeMs}ms | ` +
      `Uncomp: ${uncompTotalMB}MB → Gzip: ${compTotalMB}MB (${ratio}x) | ` +
      `RSS: ${totalRssMB}MB | Chrome: ${avgChromeMs}ms | BTree: ${avgBtreeMs}ms`
    );
  }

  console.log("\nFULL_RESULTS_JSON:" + JSON.stringify(results));
}

run().catch(console.error);
