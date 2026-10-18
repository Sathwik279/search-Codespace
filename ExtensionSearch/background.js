const EXTRACTION_ERROR =
  "Chrome did not allow this extension to read the active webpage. Try an ordinary webpage that exposes readable text.";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error("Could not configure the extension side panel:", error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_ACTIVE_TAB") {
    getActiveTabUrl()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return true;
  }

  if (message?.type !== "EXTRACT_ACTIVE_TAB") {
    return false;
  }

  extractActiveTabText()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!tab?.url) {
    return { ok: false, error: "Could not find the active tab URL." };
  }

  return { ok: true, url: tab.url, title: tab.title || "", tabId: tab.id };
}

async function extractActiveTabText() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (tab?.id === undefined) {
    return { ok: false, error: "Could not find the active tab." };
  }

  if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
    return { ok: false, error: EXTRACTION_ERROR };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_PAGE_TEXT"
    });

    if (!response?.ok) {
      return {
        ok: false,
        error: response?.error || "The active tab did not provide readable text."
      };
    }

    return response;
  } catch (_error) {
    return { ok: false, error: EXTRACTION_ERROR };
  }
}
