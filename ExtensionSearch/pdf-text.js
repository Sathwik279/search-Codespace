(function exposePdfText(global) {
  function extractPageText(items) {
    const parts = [];

    for (const item of items) {
      if (typeof item.str !== "string") continue;
      parts.push(normalizeSpacedLetters(item.str), item.hasEOL ? "\n" : " ");
    }

    return parts
      .join("")
      .replace(/[-\u00ad\u2010\u2011][\t ]*\n[\t ]*(?=\p{Ll})/gu, "")
      .replace(/[\t ]*\n[\t ]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSpacedLetters(text) {
    return text.replace(
      /(?<![\p{L}\p{N}])((?:\p{L}[ \t]+){1,}\p{L})(?![\p{L}\p{N}])/gu,
      (spacedWord) => spacedWord.replace(/[ \t]+/g, "")
    );
  }

  global.PdfText = { extractPageText };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.PdfText;
  }
})(globalThis);
