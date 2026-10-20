const statusElement = document.getElementById("status");
const statusMessageElement = document.getElementById("status-message");
const searchInput = document.getElementById("search-input");
const resultsElement = document.getElementById("results");
const resultCountElement = document.getElementById("result-count");
const documentTitleElement = document.getElementById("document-title");
const documentLocationElement = document.getElementById("document-location");
const refreshButton = document.getElementById("refresh-button");

let extractedCharacterCount = 0;
let indexedPages = [];
let invertedIndex = new StringBTree(2);
let permutermIndex = new PermutermIndex(2);
let activeDocumentUrl = "";
let activeTabId;
let currentSearchId = 0;
let currentLoadId = 0;
const DOCUMENT_INDEX_VERSION = 6;

if (globalThis.pdfjsLib) {
  globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "pdfjs/pdf.worker.min.js"
  );
}

function setStatus(message, state = "ready") {
  statusMessageElement.textContent = message;
  statusElement.dataset.state = state;
}

function showMessage(message) {
  const container = document.createElement("div");
  container.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⌕";
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  container.append(icon, paragraph);
  resultsElement.replaceChildren(container);
  resultCountElement.textContent = "";
}

function getDocumentUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.href;
}

function updateDocumentInfo(title, url) {
  const parsedUrl = new URL(url);
  documentTitleElement.textContent = title || parsedUrl.pathname.split("/").pop() || parsedUrl.hostname;
  documentLocationElement.textContent = parsedUrl.host
    ? `${parsedUrl.host}${parsedUrl.pathname}`
    : parsedUrl.pathname;
  documentLocationElement.title = url;
}

async function initializeIndex(pageTexts, documentInfo, loadId) {
  const buildResult = await SearchIndexBuilder.build(pageTexts, {
    onProgress: async ({ pageNumber, totalPages, indexedWordCount }) => {
      setStatus(
        `Indexing page ${pageNumber} of ${totalPages} · ${indexedWordCount.toLocaleString()} words`,
        "loading"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    isCancelled: () => loadId !== currentLoadId
  });
  if (buildResult === null) return false;

  await DocumentIndexStorage.saveDocument({
    url: documentInfo.url,
    title: documentInfo.title,
    pageTexts,
    indexes: {
      terms: buildResult.index.serialize(),
      permuterm: buildResult.permutermIndex.serialize()
    },
    updatedAt: Date.now(),
    version: DOCUMENT_INDEX_VERSION
  });

  if (loadId !== currentLoadId) return false;
  extractedCharacterCount = buildResult.extractedCharacterCount;
  indexedPages = pageTexts;
  invertedIndex = buildResult.index;
  permutermIndex = buildResult.permutermIndex;
  return true;
}

function restoreIndex(record, loadId) {
  if (
    record?.version !== DOCUMENT_INDEX_VERSION ||
    !Array.isArray(record.pageTexts) ||
    !record.pageTexts.every((pageText) => typeof pageText === "string")
  ) {
    throw new TypeError("The stored document index has an unsupported or invalid format.");
  }

  const restoredIndex = StringBTree.deserialize(record.indexes?.terms);
  const restoredPermutermIndex = PermutermIndex.deserialize(record.indexes?.permuterm);
  if (loadId !== currentLoadId) return false;
  indexedPages = record.pageTexts;
  extractedCharacterCount = indexedPages.reduce(
    (total, pageText) => total + pageText.length,
    Math.max(0, indexedPages.length - 1) * 2
  );
  invertedIndex = restoredIndex;
  permutermIndex = restoredPermutermIndex;
  return true;
}

function renderResults(results) {
  if (!Array.isArray(results)) {
    throw new TypeError("Search results must be an array of result objects.");
  }

  resultsElement.replaceChildren();
  const totalOccurrences = results.reduce(
    (total, result) => total + (Number.isInteger(result.occurrenceCount) ? result.occurrenceCount : 0),
    0
  );
  const pageCount = `${results.length} ${results.length === 1 ? "page" : "pages"}`;
  const occurrenceCount = `${totalOccurrences.toLocaleString()} ${
    totalOccurrences === 1 ? "occurrence" : "occurrences"
  }`;
  resultCountElement.textContent = `${pageCount} · ${occurrenceCount}`;

  if (results.length === 0) {
    showMessage("No pages matched that query. Try another search.");
    return;
  }

  for (const result of results) {
    if (!result || !Array.isArray(result.occurrences)) {
      throw new TypeError("Each page result must include an occurrences array.");
    }
    if (!Number.isInteger(result.occurrenceCount) || result.occurrenceCount < 1) {
      throw new TypeError("Each search result must include a positive occurrenceCount.");
    }
    if (result.occurrenceCount !== result.occurrences.length) {
      throw new TypeError("Page occurrenceCount must match the number of occurrence results.");
    }

    const card = document.createElement("details");
    card.className = "result-card";

    const summary = document.createElement("summary");
    const metadata = document.createElement("div");
    metadata.className = "result-meta";
    const page = document.createElement("span");
    page.textContent = `Page ${result.page}`;
    const count = document.createElement("span");
    count.textContent = `${result.occurrenceCount} ${
      result.occurrenceCount === 1 ? "occurrence" : "occurrences"
    }`;
    metadata.append(page, count);
    summary.append(metadata);
    card.append(summary);

    const occurrences = document.createElement("div");
    occurrences.className = "occurrences";
    result.occurrences.forEach((occurrence, index) => {
      if (!occurrence || typeof occurrence.snippet !== "string") {
        throw new TypeError("Each occurrence must include a string snippet.");
      }
      const occurrenceCard = document.createElement("article");
      occurrenceCard.className = "occurrence-card";
      const occurrenceMeta = document.createElement("div");
      occurrenceMeta.className = "occurrence-meta";
      occurrenceMeta.textContent = `Occurrence ${index + 1} · Position ${
        occurrence.position.toLocaleString()
      }${
        occurrence.terms.length ? ` · ${occurrence.terms.join(", ")}` : ""
      }`;
      const snippet = document.createElement("div");
      snippet.className = "occurrence-snippet";
      const before = occurrence.snippet.slice(0, occurrence.matchStart);
      const matched = occurrence.snippet.slice(occurrence.matchStart, occurrence.matchEnd);
      const after = occurrence.snippet.slice(occurrence.matchEnd);
      snippet.textContent = "";
      if (occurrence.leadingEllipsis) snippet.append(document.createTextNode("…"));
      snippet.append(document.createTextNode(before));
      const highlightedMatch = document.createElement("mark");
      highlightedMatch.textContent = matched;
      snippet.append(highlightedMatch, document.createTextNode(after));
      if (occurrence.trailingEllipsis) snippet.append(document.createTextNode("…"));
      occurrenceCard.append(occurrenceMeta, snippet);
      occurrences.append(occurrenceCard);
    });
    card.append(occurrences);
    resultsElement.append(card);
  }
}

async function runSearch(rawQuery, persist = true) {
  const query = rawQuery.trim();
  const searchId = ++currentSearchId;
  const documentUrl = activeDocumentUrl;
  const loadId = currentLoadId;

  if (!query) {
    showMessage("Search by a word prefix, wildcard, or phrase.");
    setStatus(`Index ready · ${extractedCharacterCount.toLocaleString()} characters`);
    if (persist && documentUrl) {
      try {
        await DocumentIndexStorage.saveSearchTerm(documentUrl, "");
      } catch (error) {
        if (searchId === currentSearchId && loadId === currentLoadId) {
          setStatus(`Could not save search term: ${error.message}`, "error");
        }
      }
    }
    return;
  }

  try {
    const results = SearchQueryExecutor.search(
      invertedIndex,
      permutermIndex,
      indexedPages,
      query
    );
    if (searchId !== currentSearchId || loadId !== currentLoadId) return;
    renderResults(results);
    setStatus(`Index ready · ${extractedCharacterCount.toLocaleString()} characters`);
    if (persist && documentUrl) {
      try {
        await DocumentIndexStorage.saveSearchTerm(documentUrl, query);
      } catch (error) {
        if (searchId === currentSearchId && loadId === currentLoadId) {
          setStatus(
            `Search worked, but the query could not be saved: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error"
          );
        }
      }
    }
  } catch (error) {
    if (searchId !== currentSearchId) return;
    setStatus(`Search failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    showMessage("Search or local storage failed. Try again.");
  }
}

searchInput.addEventListener("input", () => {
  void runSearch(searchInput.value);
});

function isPdfUrl(url) {
  return new URL(url).pathname.toLowerCase().endsWith(".pdf");
}

function hasPdfHeader(bytes) {
  const header = new TextDecoder("ascii").decode(bytes.subarray(0, 1024));
  return header.includes("%PDF-");
}

async function isPdfStream(url) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Range: "bytes=0-1023" }
  });

  if (!response.ok) {
    return false;
  }

  if (response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) {
    await response.body?.cancel();
    return true;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return false;
  }

  const { value } = await reader.read();
  await reader.cancel();
  return value ? hasPdfHeader(value) : false;
}

async function extractPdfText(url) {
  if (!globalThis.pdfjsLib) {
    throw new Error("PDF.js did not load. Reload the extension and try again.");
  }

  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`PDF download failed with HTTP ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();
  if (!hasPdfHeader(new Uint8Array(buffer))) {
    throw new Error("The tab URL did not return a valid PDF file.");
  }

  const pdf = await globalThis.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageTexts = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (pageNumber === 1 || pageNumber % 25 === 0 || pageNumber === pdf.numPages) {
        setStatus(`Extracting PDF page ${pageNumber} of ${pdf.numPages}`, "loading");
      }
      const page = await pdf.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        pageTexts.push(PdfText.extractPageText(textContent.items));
      } finally {
        page.cleanup();
      }
    }

    if (!pageTexts.some((pageText) => pageText.length > 0)) {
      throw new Error("No selectable text was found. This PDF may contain only scanned images.");
    }

    return pageTexts;
  } finally {
    await pdf.destroy();
  }
}

async function loadActiveTabText(forceRefresh = false) {
  const loadId = ++currentLoadId;
  currentSearchId += 1;
  activeDocumentUrl = "";
  searchInput.disabled = true;
  refreshButton.disabled = true;
  setStatus(forceRefresh ? "Refreshing the document index…" : "Checking saved index…", "loading");
  documentTitleElement.textContent = "Connecting to active tab…";
  documentLocationElement.textContent = "";
  resultsElement.replaceChildren();
  resultCountElement.textContent = "";

  try {
    const tabResponse = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" });
    if (loadId !== currentLoadId) return;
    if (!tabResponse?.ok || typeof tabResponse.url !== "string") {
      throw new Error(tabResponse?.error || "Could not determine the active tab URL.");
    }

    const url = new URL(tabResponse.url);
    const isWebUrl = url.protocol === "http:" || url.protocol === "https:";
    const isLocalPdfUrl = url.protocol === "file:" && isPdfUrl(tabResponse.url);
    if (!isWebUrl && !isLocalPdfUrl) {
      throw new Error("Open an HTTP(S) webpage or PDF before using text search.");
    }

    const documentUrl = getDocumentUrl(tabResponse.url);
    activeDocumentUrl = documentUrl;
    activeTabId = tabResponse.tabId;
    const title = tabResponse.title || url.hostname || url.pathname;
    updateDocumentInfo(title, documentUrl);

    const savedQuery = await DocumentIndexStorage.getSearchTerm(documentUrl);
    if (loadId !== currentLoadId) return;
    searchInput.value = savedQuery;

    if (!forceRefresh) {
      const savedDocument = await DocumentIndexStorage.getDocument(documentUrl);
      if (loadId !== currentLoadId) return;
      if (savedDocument) {
        try {
          restoreIndex(savedDocument, loadId);
          if (loadId !== currentLoadId) return;
          updateDocumentInfo(savedDocument.title || title, documentUrl);
          searchInput.disabled = false;
          refreshButton.disabled = false;
          setStatus(
            `Restored saved index · ${extractedCharacterCount.toLocaleString()} characters`,
            "ready"
          );
          if (savedQuery) {
            await runSearch(savedQuery, false);
          } else {
            showMessage("Search this saved document by a word prefix, wildcard, or phrase.");
          }
          return;
        } catch (restoreError) {
          if (savedDocument.version !== DOCUMENT_INDEX_VERSION) {
            console.info("The saved index uses an older format; rebuilding it.");
          } else {
            console.warn("Could not restore the saved document index; rebuilding it.", restoreError);
          }
        }
      }
    }

    setStatus("Extracting and indexing document…", "loading");
    let pageTexts;
    if (isPdfUrl(tabResponse.url) || (isWebUrl && await isPdfStream(tabResponse.url))) {
      if (loadId !== currentLoadId) return;
      pageTexts = await extractPdfText(tabResponse.url);
    } else {
      const response = await chrome.runtime.sendMessage({ type: "EXTRACT_ACTIVE_TAB" });
      if (loadId !== currentLoadId) return;
      if (!response?.ok || typeof response.text !== "string") {
        throw new Error(response?.error || "The active tab did not provide readable text.");
      }
      pageTexts = [response.text];
    }

    if (loadId !== currentLoadId) return;
    const indexSaved = await initializeIndex(
      pageTexts,
      { url: documentUrl, title },
      loadId
    );
    if (!indexSaved || loadId !== currentLoadId) return;

    searchInput.disabled = false;
    refreshButton.disabled = false;
    setStatus(`Index saved · ${extractedCharacterCount.toLocaleString()} characters`);
    if (savedQuery) {
      await runSearch(savedQuery, false);
    } else {
      showMessage("Search this document by a word prefix, wildcard, or phrase.");
    }
  } catch (error) {
    if (loadId !== currentLoadId) return;
    setStatus(
      `Could not load document: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
    documentTitleElement.textContent = "Document unavailable";
    showMessage("Open a readable webpage or text-based PDF, then try again.");
  } finally {
    if (loadId === currentLoadId) {
      refreshButton.disabled = !activeDocumentUrl;
    }
  }
}

refreshButton.addEventListener("click", () => {
  void loadActiveTabText(true);
});

chrome.tabs.onActivated.addListener(() => {
  void loadActiveTabText();
});


chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === "complete") {
    void loadActiveTabText();
  }
});

void loadActiveTabText();
