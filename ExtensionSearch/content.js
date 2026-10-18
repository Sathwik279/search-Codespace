if (!globalThis.__activeTabTextSearchListenerInstalled) {
  globalThis.__activeTabTextSearchListenerInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXTRACT_PAGE_TEXT") {
      return false;
    }

    const text = extractPageText();
    if (!text) {
      sendResponse({
        ok: false,
        error:
          "No readable text was found on this tab. A PDF may still be loading, be image-only, or use Chrome's built-in viewer, which restricts extension access."
      });
      return false;
    }

    sendResponse({
      ok: true,
      text,
      title: document.title,
      url: location.href
    });
    return false;
  });
}

function extractPageText() {
  const pdfTextLayers = Array.from(document.querySelectorAll(".textLayer"))
    .map((layer) => layer.innerText || layer.textContent || "")
    .filter((text) => text.trim());

  const pageText = pdfTextLayers.length
    ? pdfTextLayers.join("\n")
    : document.body?.innerText || document.body?.textContent || "";

  return pageText.replace(/\n[ \t]+/g, "\n").trim();
}
