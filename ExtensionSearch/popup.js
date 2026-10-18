const statusElement = document.getElementById("status");
const searchInput = document.getElementById("search-input");
const resultsElement = document.getElementById("results");
const resultCountElement = document.getElementById("result-count");

let extractedText = "";

function setStatus(message, state = "ready") {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function showMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;
  resultsElement.replaceChildren(paragraph);
  resultCountElement.textContent = "";
}

// CUSTOM INDEX HOOK: build or refresh your inverted index from the extracted text here.
async function initializeIndex(text) {
  extractedText = text;
  // TODO: Initialize your custom inverted index using `text`.
}

// CUSTOM SEARCH HOOK: return an array of { snippet, page?, score? } result objects.
async function searchIndex(query) {
  // TODO: Replace this placeholder with your custom index lookup and ranking logic.
  // `extractedText` is available here if your index implementation needs the source text.
  void query;
  return [];
}

function renderResults(results) {
  if (!Array.isArray(results)) {
    throw new TypeError("searchIndex(query) must return an array of result objects.");
  }

  resultsElement.replaceChildren();
  resultCountElement.textContent = `${results.length} ${results.length === 1 ? "match" : "matches"}`;

  if (results.length === 0) {
    showMessage("No matches found.");
    return;
  }

  for (const result of results) {
    if (!result || typeof result.snippet !== "string") {
      throw new TypeError('Each search result must include a string "snippet".');
    }

    const card = document.createElement("article");
    card.className = "result-card";

    const metadata = [];
    if (result.page !== undefined) metadata.push(`Page ${result.page}`);
    if (result.score !== undefined) metadata.push(`Score ${result.score}`);

    if (metadata.length) {
      const meta = document.createElement("div");
      meta.className = "result-meta";
      meta.textContent = metadata.join(" · ");
      card.append(meta);
    }

    const snippet = document.createElement("div");
    snippet.textContent = result.snippet;
    card.append(snippet);
    resultsElement.append(card);
  }
}

let currentSearchId = 0;
searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  const searchId = ++currentSearchId;

  if (!query) {
    showMessage("Enter a term to search this document.");
    return;
  }

  try {
    const results = await searchIndex(query);
    if (searchId !== currentSearchId) return;
    renderResults(results);
    setStatus(`Ready to search · ${extractedText.length.toLocaleString()} characters`);
  } catch (error) {
    if (searchId !== currentSearchId) return;
    setStatus(`Search failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    showMessage("The custom search function returned an error.");
  }
});

async function loadActiveTabText() {
  setStatus("Extracting text from the active tab…", "loading");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "EXTRACT_ACTIVE_TAB"
    });

    if (!response?.ok || typeof response.text !== "string") {
      throw new Error(response?.error || "The active tab did not provide readable text.");
    }

    await initializeIndex(response.text);
    searchInput.disabled = false;
    setStatus(`Ready to search · ${response.text.length.toLocaleString()} characters`);
    showMessage("Enter a term to search this document.");
  } catch (error) {
    setStatus(
      `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
    showMessage("Try opening a readable webpage or a PDF whose text is available to the page.");
  }
}

void loadActiveTabText();
