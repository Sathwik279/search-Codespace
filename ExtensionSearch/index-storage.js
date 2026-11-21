(function exposeDocumentIndexStorage(global) {
  const DATABASE_NAME = "active-tab-text-search";
  const DATABASE_VERSION = 3;
  const DOCUMENT_STORE = "documents";
  const PAGE_STORE = "pages";
  const SEARCH_STORE = "searches";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
          database.createObjectStore(DOCUMENT_STORE, { keyPath: "url" });
        }
        if (!database.objectStoreNames.contains(SEARCH_STORE)) {
          database.createObjectStore(SEARCH_STORE, { keyPath: "url" });
        }
        if (!database.objectStoreNames.contains(PAGE_STORE)) {
          database.createObjectStore(PAGE_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the index database."));
      request.onblocked = () => reject(new Error("The index database upgrade is blocked by another extension page."));
    });
  }

  async function readRecord(storeName, url) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(url);

      request.onsuccess = async () => {
        try {
          const result = request.result;
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      request.onerror = () => reject(request.error || new Error("Could not access the stored document index."));
      transaction.onabort = () => reject(transaction.error || new Error("The document index transaction was aborted."));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error || new Error("The document index transaction failed."));
    });
  }

  async function saveDocument(record) {
    if (
      !record ||
      typeof record.url !== "string" ||
      !Array.isArray(record.pageTexts) ||
      !record.pageTexts.every((pageText) => typeof pageText === "string")
    ) {
      throw new TypeError("Document records must include page text strings.");
    }
    const database = await openDatabase();
    const payloadToSave = {
      ...record,
      pageCount: record.pageTexts.length
    };
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([DOCUMENT_STORE, PAGE_STORE], "readwrite");
      transaction.objectStore(DOCUMENT_STORE).put(payloadToSave);
      const pageStore = transaction.objectStore(PAGE_STORE);
      record.pageTexts.forEach((text, index) => {
        pageStore.put({
          id: `${record.url}#${index + 1}`,
          url: record.url,
          page: index + 1,
          text
        });
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("Could not save the document index."));
      };
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the document index."));
    });
  }

  async function getPageText(url, page) {
    if (typeof url !== "string" || !Number.isInteger(page) || page < 1) {
      throw new TypeError("A document URL and positive page number are required.");
    }
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PAGE_STORE, "readonly");
      const request = transaction.objectStore(PAGE_STORE).get(`${url}#${page}`);
      request.onsuccess = () => resolve(request.result?.text || "");
      request.onerror = () => reject(request.error || new Error("Could not access stored page text."));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error || new Error("The page text transaction failed."));
    });
  }

  async function saveSearchTerm(url, query) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(SEARCH_STORE, "readwrite");
      transaction.objectStore(SEARCH_STORE).put({ url, query });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("Could not save the search term."));
      };
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the search term."));
    });
  }

  async function saveSearchResults(url, query, results) {
    if (
      typeof url !== "string" ||
      typeof query !== "string" ||
      !Array.isArray(results)
    ) {
      throw new TypeError("Search results must include a URL, query, and result array.");
    }
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(SEARCH_STORE, "readwrite");
      transaction.objectStore(SEARCH_STORE).put({ url, query, results });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("Could not save search results."));
      };
      transaction.onerror = () => reject(transaction.error || new Error("Could not save search results."));
    });
  }

  global.DocumentIndexStorage = {
    getDocument: (url) => readRecord(DOCUMENT_STORE, url),
    getPageText,
    getSearchTerm: async (url) => (await readRecord(SEARCH_STORE, url))?.query || "",
    getSearchResults: async (url) => (await readRecord(SEARCH_STORE, url))?.results || null,
    saveDocument,
    saveSearchTerm,
    saveSearchResults
  };
})(globalThis);
