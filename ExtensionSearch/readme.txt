ACTIVE TAB TEXT SEARCH - CHROME EXTENSION
=========================================

Purpose
-------
This Manifest V3 Chrome extension opens as a Chrome side panel. It extracts
text from the active tab. PDF files are downloaded from their tab URL and
parsed locally with PDF.js, avoiding dependence on Chrome's built-in PDF
viewer DOM. Other HTTP(S) webpages are read by an injected content script.

The extension builds an in-memory String B-tree inverted index and persists
the serialized tree, page text, and last search term in IndexedDB. Reopening
the side panel for the same document restores its index without extracting or
tokenizing the document again. A refresh button explicitly rebuilds the saved
index.

Files
-----
manifest.json
  Declares the Manifest V3 extension, side panel, service worker, and permissions.
  `activeTab` grants temporary access following a user action on the extension.
  `scripting` allows the service worker to inject content.js into webpages.
  `<all_urls>` grants the extension host access needed to fetch PDF URLs from
  different sites. The `sidePanel` permission registers popup.html as the
  toolbar side panel. Chrome 114 or later is required.

background.js
  Configures the toolbar action to open the side panel and handles two
  extension-page messages:
  - `GET_ACTIVE_TAB` queries the active tab in the last-focused window and
    returns its URL.
  - `EXTRACT_ACTIVE_TAB` injects content.js into an HTTP(S) active tab and
    requests its readable page text.
  Errors are returned to the side panel rather than treated as successful
  extraction.

content.js
  Reads text from the active webpage. If `.textLayer` elements are present,
  their text is combined; otherwise it reads the page body's innerText or
  textContent. This path is for ordinary webpages and does not parse Chrome's
  built-in PDF viewer.

popup.html and popup.css
  Define the side panel UI: current document, extraction/index status, search
  field, refresh control, result count, and page-grouped results.

pdf-text.js
  Reconstructs a searchable page string from PDF.js text items, honoring
  `hasEOL` line boundaries and joining words split by a line-ending hyphen
  (for example, `tokeniza-` at the end of a line followed by `tion`). It also
  rejoins OCR words whose letters are separated by spaces inside a text item.

popup.js
  Coordinates active-tab detection, PDF or webpage text extraction, and the
  index/search flow. It restores a stored tree when available; otherwise it
  asks SearchIndexBuilder to build and persist an index. It validates results
  from SearchQueryExecutor and renders snippets with textContent.
  `currentSearchId` prevents an older asynchronous search from replacing the
  results for newer input.

search/tokenizer.js
  Normalizes document tokens and query tokens consistently. Document tokens
  include their original character offsets and lengths.

search/index-builder.js
  Builds a StringBTree from page text using SearchTokenizer. It groups each
  token's positions by page and reports progress so the UI can yield during
  large indexing jobs. It returns the in-memory index and character/word
  counts; popup.js owns persistence and cancellation.

search/query-executor.js
  Expands each query token with the index's prefixSearch method, combines
  postings into page/occurrence results, and builds context snippets. It does
  not rank results; pages are returned in ascending page-number order.

indexes/
  Contains the individual search-index implementations. Currently it contains
  btree.js; future phrase, bigram, or k-gram indexes can be added here as
  separate implementations.

indexes/btree.js
  Defines StringBTree and its node structure. The configurable order controls
  the maximum number of keys per node (2 * order). Insertion keeps string keys
  sorted, groups each term's positions and match lengths by page, and splits
  overflowing nodes. `search(key)` returns page/position groups for an exact
  key; `prefixSearch(prefix)` returns matching terms and their postings.
  `serialize()` and `StringBTree.deserialize(data)` convert the in-memory tree
  to and from a structured-cloneable representation for IndexedDB.

index-storage.js
  Stores each document's page text and serialized B-tree in the extension's
  IndexedDB database. It separately stores the last search term by document
  URL so typing a query does not rewrite the full index.

pdfjs/
  Contains the locally bundled PDF.js 3.11.174 library (`pdf.min.js`), its
  worker (`pdf.worker.min.js`), and the upstream license. Local scripts are
  used instead of loading executable code from a CDN at runtime.

Extraction flow
---------------
1. Opening the side panel calls `loadActiveTabText()` and displays the loading
   indicator.
2. The side panel asks background.js for the active tab URL. Only HTTP(S) pages and
   local file URLs ending in `.pdf` are accepted.
3. The document URL without its fragment is used as its IndexedDB cache key.
   Unless the user requests a refresh, the extension first checks IndexedDB
   for saved page text and a serialized B-tree. A valid saved tree is restored
   and the saved search term is reapplied without extracting or tokenizing.
4. If no saved index exists, a URL whose path ends in `.pdf` is treated as a
   PDF. For other HTTP(S) URLs,
   the side panel makes a ranged request and checks the response content type or
   the `%PDF-` file signature to detect a PDF stream. The probe may fail if
   the server blocks extension requests; such failures are reported.
5. For a PDF, the side panel fetches the URL with the current session credentials,
   reads the response as an ArrayBuffer, and checks the PDF signature. It
   passes the bytes to `pdfjsLib.getDocument()`.
6. The side panel loops through every PDF page and reconstructs text using
   PDF.js item's `hasEOL` line-boundary metadata. It rejoins OCR text with
   per-letter spacing and joins line-end hyphenated words before tokenization.
   It retains each page string for snippets and status length, then releases
   that page's PDF.js resources before proceeding.
   A PDF with no selectable text (for example, an image-only scan without OCR)
   cannot provide text through this process.
7. For a non-PDF HTTP(S) page, the side panel asks background.js to inject
   content.js and return text exposed in the page DOM.
8. On success, each page string is tokenized. For every term the tree stores
   its 1-based page number and arrays of character start offsets and original
   match lengths, grouped by page. Indexing yields periodically so the side
   panel can update progress and remain responsive. The page text and
   serialized tree are saved in IndexedDB, and the search field is enabled.
   On failure, the panel shows an error.
9. Typing searches the restored or current tree and saves the last query for
   that document. The toolbar button opens the side panel; the refresh button
   extracts and indexes the current document again.

Custom index and search hooks
-----------------------------
The search pipeline is split across search/tokenizer.js,
search/index-builder.js, search/query-executor.js, and popup.js:

Index initialization
  After a cache miss or explicit refresh, SearchIndexBuilder tokenizes each
  page into lowercase Unicode letters and numbers through SearchTokenizer.
  Punctuation separates words; no stop words are removed. Occurrences are grouped as
  `{ page, positions, lengths }`; offsets refer to the reconstructed searchable
  page string and lengths preserve the original token boundaries. A word joined across a PDF
  line-ending hyphen is indexed as the complete word. OCR words encoded with
  spaces between letters are also reconstructed. PDF page numbers start at 1;
  ordinary webpage text is indexed as page 1. The page strings and serialized
  B-tree are written to IndexedDB before the search input is enabled.

Posting storage walkthrough
---------------------------
The index builder creates one intermediate occurrence object for every token.
For the page text `the cat and the cat`, tokenization produces:

  `the` -> { term: "the", position: 0,  end: 3 }
  `cat` -> { term: "cat", position: 4,  end: 7 }
  `and` -> { term: "and", position: 8,  end: 11 }
  `the` -> { term: "the", position: 12, end: 15 }
  `cat` -> { term: "cat", position: 16, end: 19 }

The builder passes each occurrence to the B-tree as the key and a posting input:

  index.insert(token.term, {
    page: pageIndex + 1,
    position: token.position,
    end: token.end
  });

For example, the two `the` occurrences are passed separately:

  insert("the", { page: 1, position: 0,  end: 3 })
  insert("the", { page: 1, position: 12, end: 15 })

The B-tree finds the leaf slot for `"the"` and appends both occurrences to
that term's posting list. `_appendPosting()` converts each exclusive `end`
offset into a length (`end - position`), so the stored page posting becomes:

  key "the"
      |
      v
  node.postings[the-key-slot]
      |
      +-- [ { page: 1, positions: [0, 12], lengths: [3, 3] } ]

The same process for `"cat"` produces:

  key "cat"
      |
      v
  node.postings[cat-key-slot]
      |
      +-- [ { page: 1, positions: [4, 16], lengths: [3, 3] } ]

The complete leaf storage is conceptually nested like this (keys are kept in
sorted order, so the actual slot numbers depend on the node):

  node.keys
      [ "and"                 | "cat"                                  | "the"                                  ]
             |                       |                                        |
             v                       v                                        v
  node.postings
      [ [ { page: 1, ... } ] | [ { page: 1, positions: [4,16], ... } ] | [ { page: 1, positions: [0,12], ... } ] ]
        ^                       ^                                        ^
        posting list for and    posting list for cat                     posting list for the

More explicitly, the shape is:

  node.postings = [
    [ { page: 1, positions: [8],      lengths: [3] } ],  // node.keys[0] = "and"
    [ { page: 1, positions: [4, 16],  lengths: [3, 3] } ], // node.keys[1] = "cat"
    [ { page: 1, positions: [0, 12],  lengths: [3, 3] } ]  // node.keys[2] = "the"
  ];

So the bracket levels are:

  node.postings
    [ posting list for key 0, posting list for key 1, ... ]
        [ page posting, page posting, ... ]
            { page, positions: [...], lengths: [...] }

`positions[i]` and `lengths[i]` describe the same occurrence. Positions are
zero-based character offsets within that page's extracted text; lengths are
the original token span lengths. The exclusive end is recovered as
`positions[i] + lengths[i]`. A leaf's `node.postings[i]` belongs to
`node.keys[i]`; internal nodes have no posting lists.

`SearchQueryExecutor.search(index, pageTexts, query)`
  Called by popup.js whenever the search field changes. It returns page result
  objects containing the page number, occurrence count, and occurrence snippets.

  Query words are normalized the same way as indexed words. Each query token
  uses B-tree prefix search, so a query such as `app` matches indexed terms
  such as `apple` and `application`. Results are grouped by page and displayed
  in ascending page-number order; no ranking is applied. Each page result is
  an expandable section showing that page's occurrence count and one separate
  context snippet for every matching word occurrence. Occurrences are shown
  in text order with their extracted-text offset and matched term. The results
  header displays both the number of matching pages and the total occurrences
  across those pages.

  Page labels are the PDF page positions (for example, PDF page 3 of the file),
  not a printed page number from the document footer. PDF.js may extract
  selectable footer text, but it exposes it as ordinary page text rather than
  identifying it as a page number. Footer words are therefore indexed like
  other text and may also match a search query.

Search operates on the in-memory tree after extraction or restore. IndexedDB
persists a serialized copy and page text locally; it does not make the B-tree
itself a disk-based tree, provide fixed-size block access, or change node
operations into disk I/O.

Permissions, privacy, and limitations
-------------------------------------
- PDF fetching and parsing happen in the extension side panel using the active
  document URL; the extracted PDF text is not sent to a separate indexing or
  search server by this code. The PDF request itself goes to the document's
  origin and may include the browser's current session credentials.
- `<all_urls>` is a broad host permission required for fetching PDFs across
  sites. Review this permission if narrowing the extension's access later.
- Cross-origin rules, server authentication, access policies, or missing
  direct PDF URLs can prevent a PDF from being fetched.
- Scanned/image-only PDFs have no extractable text unless an OCR text layer is
  embedded in the document.
- PDF text extraction order and completeness depend on how text is encoded in
  each PDF. `hasEOL` and hyphenation reconstruction improve common wrapped-word
  cases, and OCR text items with per-letter spacing are rejoined, but these
  changes cannot guarantee identical matching to Chrome Find for every PDF.
  Test against representative documents and compare occurrence totals when
  validating extraction changes.
- Cached indexes created with older extraction versions are rebuilt when
  opened, so the improved extraction and compact posting format are applied to
  existing documents. An informational console message about an older index
  means it is being rebuilt; it is not itself an indexing failure.
- Very large PDFs can still require substantial memory because PDF.js must
  parse the document and the extension retains page text for snippets. The
  bundled stress fixture has 6,061 pages; allow indexing time and avoid
  refreshing it repeatedly if the browser reports memory pressure.
- Ordinary pages must expose readable text in the DOM. Chrome does not allow
  extension scripts on some browser-internal or restricted pages.
- To open local PDFs, enable the extension's "Allow access to file URLs"
  setting in chrome://extensions.
- Cached indexes and page text persist locally between side-panel sessions and
  are keyed by document URL without its URL fragment. If a document changes
  while keeping the same URL, use Refresh document index to replace its cache.
- The last search term is stored per document and restored when its index is
  reopened.
- IndexedDB data is local to this browser profile and extension installation;
  it is not synchronized across devices or sent to a search service.
- There is no index-management screen in the current UI. Removing the
  extension/browser profile data removes its local IndexedDB records.

Load and test in Chrome
-----------------------
1. Open chrome://extensions and enable Developer mode.
2. Select "Load unpacked" and choose the ExtensionSearch folder. On Chrome
   114+, the extension action opens the side panel.
3. Open a text-based webpage or PDF in a tab and click the extension icon.
4. Wait for the status to say the index is saved, then enter one or more word
   prefixes. Results show matching pages and occurrence snippets; results are
   not ranked.
5. Close and reopen the side panel for that document to restore the saved
   index and previous search. Use the refresh icon to rebuild after the source
   document changes.

After changing extension files, reload the unpacked extension from
chrome://extensions before testing the changes.

Troubleshooting
---------------
- A message that Chrome did not allow reading the page usually means the tab
  is browser-internal/restricted or the webpage does not expose readable DOM
  text. Try a normal webpage or a direct PDF URL.
- A PDF download error can mean the server blocks extension access, requires
  authentication, or does not expose a PDF response at that URL.
- "The tab URL did not return a valid PDF file" means the URL returned data
  without a PDF signature.
- "No selectable text was found" means the PDF may be scanned/image-only.
- If IndexedDB cannot be opened or saved, the panel displays an error rather
  than claiming the index or search term was persisted.
- If the side panel reports a search error, check that each result includes a
  string `snippet` and that the result collection is an array.
