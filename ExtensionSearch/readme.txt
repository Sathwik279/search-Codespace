ACTIVE TAB TEXT SEARCH - CHROME EXTENSION
=========================================

Overview
--------
This is a Manifest V3 Chrome extension scaffold for extracting readable text
from the active tab when its popup opens. The extracted text is passed to an
index initialization hook. Typing in the popup calls a search hook and displays
the returned snippets. The inverted index and search algorithm are intentionally
left for you to implement.

Files
-----
manifest.json
  Declares the Manifest V3 extension, popup, service worker, and permissions.
  `activeTab` grants temporary access to the tab after the user opens the
  extension popup; `scripting` is used to inject the extraction content script.
  The extension requests no broad host permissions.

background.js
  Handles extraction requests from the popup. It finds the active tab, injects
  content.js, asks it to read the page, and returns either text or an explicit
  error to the popup.

content.js
  Reads readable text from the page. If PDF.js text-layer elements (`.textLayer`)
  are present, it reads those; otherwise it falls back to the page's visible
  text (`innerText`).

popup.html and popup.css
  Provide the popup layout and styles: extraction status, search input, and
  results area.

popup.js
  Coordinates extraction and search. It contains the two customization points
  described below and validates/renders search results using textContent.

Custom index and search implementation
--------------------------------------
1. Open popup.js.
2. Implement `initializeIndex(text)`. It is called after the active tab's text
   has been extracted. Build or replace your inverted index here. The raw text
   is also retained in the popup-level `extractedText` variable.
3. Implement `searchIndex(query)`. It is called whenever the search input
   changes. It may be synchronous or asynchronous, and must return an array in
   this shape:

     [
       { snippet: "A matching passage from the document", page: 2, score: 0.91 },
       { snippet: "Another matching passage" }
     ]

   `snippet` is required and must be a string. `page` and `score` are optional.
   The popup renders these fields and shows the match count. Replace the
   placeholder return value in searchIndex with the output of your index.

Behavior and limitations
------------------------
- Opening the popup automatically starts extraction; no file upload is used.
- The popup communicates with the service worker, which injects content.js into
  the active HTTP(S) tab. The tab's text stays local to the extension; this code
  does not send it to a server.
- Pages must expose their text in the DOM. PDF.js text layers are explicitly
  supported when they are present.
- Chrome restricts extensions from injecting scripts into browser-internal
  pages, and its built-in PDF viewer may not expose PDF text to an extension.
  In that case extraction cannot be guaranteed, and the popup displays an error
  rather than pretending extraction succeeded. A scanned/image-only PDF also
  has no text to extract unless it has an OCR text layer.
- For local PDFs, Chrome may require enabling the extension's "Allow access to
  file URLs" option; the built-in viewer restriction may still apply.

Load and test in Chrome
-----------------------
1. Open chrome://extensions and enable Developer mode.
2. Select "Load unpacked" and choose the ExtensionSearch folder.
3. Open a text-based webpage or PDF in a tab and click the extension icon.
4. Confirm the status changes to a character count, then enter a query.
5. Until searchIndex is implemented, searches intentionally return no matches.
   Implement the hook and reload the extension from chrome://extensions to
   test your results.

Troubleshooting
---------------
- "Chrome did not allow this extension..." means that the tab cannot be
  scripted, commonly because it is a browser-internal page or built-in PDF
  viewer. Try another viewer/page that exposes the text.
- "No readable text was found..." can mean the page is still loading, is
  image-only, or does not expose text in the DOM.
- If the popup reports a search error, check that searchIndex returns an array
  and every result includes a string `snippet`.
