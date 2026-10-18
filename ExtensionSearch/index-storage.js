(function exposeDocumentIndexStorage(global) {
  const DATABASE_NAME = "active-tab-text-search";
  const DATABASE_VERSION = 2;
  const DOCUMENT_STORE = "documents";
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

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not access the stored document index."));
      transaction.onabort = () => reject(transaction.error || new Error("The document index transaction was aborted."));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error || new Error("The document index transaction failed."));
    });
  }

  async function saveDocument(record) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
      transaction.objectStore(DOCUMENT_STORE).put(record);
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

  global.DocumentIndexStorage = {
    getDocument: (url) => readRecord(DOCUMENT_STORE, url),
    getSearchTerm: async (url) => (await readRecord(SEARCH_STORE, url))?.query || "",
    saveDocument,
    saveSearchTerm
  };
})(globalThis);
