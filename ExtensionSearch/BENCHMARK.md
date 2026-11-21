# ExtensionSearch — Benchmark Report

**Benchmark date:** 2026-11-21  
**Environment:** Node.js v24.19.0, Windows, V8 4 GB heap for the stress run  
**Implementation:** current repository code; no compression or substring-search features are currently implemented  
**Test command:** `node --test tests/*.test.js`  
**Benchmark commands:**

```bash
node tests/benchmark.js
node --max-old-space-size=4096 --expose-gc tests/stress-test.js
```

> The “Chrome linear find” figures are an in-Node simulation based on repeated
> `String.indexOf` scans. They are a simple scanning baseline, not measurements
> collected from an actual Chrome Find-in-page session.

## 1. Correctness Tests

The current suite passed **26 of 26 tests**.

Covered behavior includes:

- B-tree insertion, search, prefix search, leaf posting lists, and serialization
- Delta-encoded Uint32Array postings and deserialization validation
- Permuterm prefix/suffix/middle wildcard resolution
- Trigram typo-candidate generation
- Phrase matching by consecutive token ordinals
- Lazy page text loading
- PDF text reconstruction and line-hyphen/OCR handling
- Index-builder cancellation

## 2. Three-Tier Expressive-Query Benchmark

This run used synthetic documents generated from 42 IR/CS vocabulary terms.
Each of 300 averaged query runs included six exact-term queries. The native
baseline was repeated `String.indexOf` scanning across every synthetic page.

| Tier | Pages | Words | Text | Build | Linear baseline | Indexed metadata | Indexed + snippets | Metadata speedup |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Medium Document | 50 | 17,500 | 0.15 MB | 57.45 ms | 0.292 ms | 0.290 ms | 0.359 ms | 1.0× |
| Large Document | 200 | 80,000 | 0.71 MB | 102.40 ms | 1.296 ms | 0.984 ms | 1.121 ms | 1.3× |
| Textbook / Heavy PDF | 500 | 200,000 | 1.77 MB | 236.57 ms | 3.206 ms | 2.259 ms | 2.742 ms | 1.4× |

All three tiers returned 100% occurrence parity with the linear baseline:

- Medium: 2,407 / 2,407 occurrences
- Large: 11,368 / 11,368 occurrences
- Textbook: 28,567 / 28,567 occurrences

The first build is not faster than a one-off scan. The amortised break-even
counts measured by the script were 30,076 searches for the medium tier,
330 searches for the large tier, and 250 searches for the textbook tier.
IndexedDB persistence removes the rebuild from later sessions.

## 3. Expressive Query Results

| Query | Example | Latency | Pages matched |
|---|---|---:|---:|
| Wildcard | `algo*` on 50 pages | 0.484 ms | 50 |
| Wildcard | `algo*` on 200 pages | 1.454 ms | 200 |
| Wildcard | `algo*` on 500 pages | 4.062 ms | 500 |
| Two-word phrase | `inverted index` on 50 pages | 0.869 ms | 16 |
| Two-word phrase | `inverted index` on 200 pages | 3.505 ms | 37 |
| Two-word phrase | `inverted index` on 500 pages | 4.217 ms | 96 |
| Typo suggestion | `databse` → `database`, 50 pages | 2.029 ms | — |
| Typo suggestion | `databse` → `database`, 200 pages | 0.426 ms | — |
| Typo suggestion | `databse` → `database`, 500 pages | 0.249 ms | — |

## 4. Five-Tier Stress Benchmark

The stress corpus expands 50 base IR/CS terms with numeric suffixes to create
a large, highly varied vocabulary.

| Tier | Pages | Words | Raw text | Build | Serialize | Linear baseline | Indexed + snippets | Heap used | RSS | Serialized size |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Small Paper | 20 | 7,000 | 0.08 MB | 397.6 ms | 179.1 ms | 0.097 ms | 0.375 ms | 36.71 MB | 85.54 MB | 10.45 MB |
| Medium Report | 100 | 35,000 | 0.40 MB | 1,149.5 ms | 441.9 ms | 0.528 ms | 2.154 ms | 128.92 MB | 266.88 MB | 28.69 MB |
| Standard Textbook | 500 | 200,000 | 2.31 MB | 1,780.6 ms | 593.9 ms | 2.913 ms | 7.415 ms | 291.08 MB | 410.91 MB | 36.15 MB |
| Large Corpus | 1,500 | 600,000 | 6.92 MB | 3,100.2 ms | 835.5 ms | 8.670 ms | 24.445 ms | 574.21 MB | 703.59 MB | 41.23 MB |
| Extreme Stress Fixture | 6,000 | 2,100,000 | 24.21 MB | 8,710.4 ms | 1,800.2 ms | 30.484 ms | 99.400 ms | 1,512.84 MB | 1,686.10 MB | 60.36 MB |

For the stress corpus, snippet-producing indexed searches were slower than the
linear baseline at every tier. This is primarily caused by the larger synthetic
vocabulary and the stress script invoking the compatibility search path that
creates snippets. It demonstrates that larger index memory and richer
expressive queries do not guarantee a faster raw exact-term scan.

## 5. Serialized Storage Components

These are JSON serialization sizes; the current implementation does **not**
apply gzip or native browser compression before storing an index.

| Tier | B-tree | Permuterm | Trigram | Total |
|---|---:|---:|---:|---:|
| Small Paper | 634.86 KB | 9,049.09 KB | 1,015.85 KB | 10.45 MB |
| Medium Report | 1,945.44 KB | 24,692.53 KB | 2,742.27 KB | 28.69 MB |
| Standard Textbook | 4,394.94 KB | 29,365.76 KB | 3,255.93 KB | 36.15 MB |
| Large Corpus | 9,627.46 KB | 29,333.78 KB | 3,255.93 KB | 41.23 MB |
| Extreme Stress | 29,226.14 KB | 29,331.68 KB | 3,255.93 KB | 60.36 MB |

Permuterm and trigram storage plateaued around 500 pages for this synthetic
vocabulary. The B-tree posting component continued to grow with document length.

## 6. Current-Implementation Takeaways

- The in-memory exact-term metadata path is about **1.3×–1.4× faster** than the
  three-tier synthetic linear baseline for 200–500-page documents.
- Snippet generation adds meaningful cost; the production UI avoids it for
  ordinary typing and loads snippets only for expanded result pages.
- Prefix, wildcard, phrase, and typo correction provide functionality that a
  linear `Ctrl+F` implementation does not provide.
- The current exact-term stress benchmark does not establish a universal
  speed advantage over linear scanning.
- The three indexes use substantial memory: RSS reached about **1.69 GB** for
  the 6,000-page / 2.1-million-word stress fixture.
- IndexedDB persistence provides cache/reopen benefits, but IndexedDB is not
  a disk-based B-tree or disk-I/O optimization.

## 7. Hard Limits Observed

The 6,000-page fixture completed successfully with 1.51 GB V8 heap use and
1.69 GB RSS. This is a benchmark observation, not a guaranteed browser limit.
Chrome tab and extension limits vary with available memory and browser profile
quota.

## 8. Reproduction

```bash
# Unit and integration tests
node --test tests/*.test.js

# Three-tier exact/prefix/wildcard/phrase/typo benchmark
node tests/benchmark.js

# Five-tier build, serialization, memory, RSS, and query stress benchmark
node --max-old-space-size=4096 --expose-gc tests/stress-test.js
```
