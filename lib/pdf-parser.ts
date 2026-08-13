import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";

// Configure worker
if (typeof window !== "undefined") {
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}

export interface PdfPage {
  fileName: string;
  pageNumber: number;
  text: string;
  wordCount: number;
  charCount: number;
}

export interface PdfSearchResult {
  fileName: string;
  pageNumber: number;
  snippet: string;
  matchCount: number;
  score: number;
  fullText: string;
  matchedWords: string[];
}

export interface PdfSearchOptions {
  mode: "smart" | "exact" | "regex";
  caseSensitive: boolean;
  wholeWord: boolean;
}

/**
 * Reconstructs formatted text from PDF text content items with accurate spacing and line breaks.
 */
function reconstructTextFromItems(items: any[]): string {
  if (!items || items.length === 0) return "";

  let lines: string[] = [];
  let currentLine = "";
  let lastY: number | null = null;
  let lastX: number | null = null;
  let lastWidth: number | null = null;

  for (const item of items) {
    if (!item || typeof item.str !== "string") continue;
    const str = item.str;

    const transform = item.transform;
    const currentX = transform ? transform[4] : null;
    const currentY = transform ? transform[5] : null;

    // Detect new line based on vertical shift or hasEOL
    const isNewLine =
      lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 3;

    if (isNewLine) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
      lastX = null;
      lastWidth = null;
    } else if (lastX !== null && currentX !== null && lastWidth !== null) {
      // Horizontal spacing check
      const gap = currentX - (lastX + lastWidth);
      if (gap > 2 && !currentLine.endsWith(" ") && !str.startsWith(" ")) {
        currentLine += " ";
      }
    }

    currentLine += str;

    if (item.hasEOL) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
      lastX = null;
      lastWidth = null;
    } else {
      lastX = currentX;
      lastWidth = item.width || 0;
    }

    lastY = currentY;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .trim();
}

/**
 * Extracts text from a PDF File, using PDF.js and automatic OCR fallback for scanned pages.
 */
export async function extractPdfPages(
  file: File,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<PdfPage[]> {
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || "5.3.93"}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || "5.3.93"}/standard_fonts/`,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pages: PdfPage[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) {
      onProgress(
        pageNum,
        totalPages,
        `Reading page ${pageNum} of ${totalPages} in ${file.name}...`
      );
    }

    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      let extractedText = reconstructTextFromItems(textContent.items);

      // If text extraction yielded virtually nothing (< 20 characters), try OCR for scanned page
      if (extractedText.trim().length < 20 && typeof document !== "undefined") {
        if (onProgress) {
          onProgress(
            pageNum,
            totalPages,
            `Running OCR on scanned page ${pageNum} of ${totalPages}...`
          );
        }

        try {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL("image/png");
            const ocrResult = await Tesseract.recognize(dataUrl, "eng");
            if (ocrResult.data && ocrResult.data.text) {
              extractedText = (extractedText + "\n" + ocrResult.data.text).trim();
            }
          }
        } catch (ocrErr) {
          console.warn(`OCR fallback failed for page ${pageNum}:`, ocrErr);
        }
      }

      const wordCount = extractedText
        .split(/\s+/)
        .filter((w) => w.length > 0).length;

      pages.push({
        fileName: file.name,
        pageNumber: pageNum,
        text: extractedText,
        wordCount,
        charCount: extractedText.length,
      });
    } catch (pageErr) {
      console.error(`Error extracting page ${pageNum} of ${file.name}:`, pageErr);
      pages.push({
        fileName: file.name,
        pageNumber: pageNum,
        text: `[Error reading page ${pageNum}]`,
        wordCount: 0,
        charCount: 0,
      });
    }
  }

  return pages;
}

/**
 * Escapes regex special characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Smart Natural Language Processing & Keyword Search over PDF Pages.
 */
export function searchPdfPages(
  pages: PdfPage[],
  query: string,
  options: PdfSearchOptions = {
    mode: "smart",
    caseSensitive: false,
    wholeWord: false,
  }
): PdfSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery || pages.length === 0) return [];

  const results: PdfSearchResult[] = [];

  // Parse query tokens & quoted phrases
  const quotedRegex = /"([^"]+)"/g;
  const quotedPhrases: string[] = [];
  let cleanedQuery = trimmedQuery;

  let match: RegExpExecArray | null;
  while ((match = quotedRegex.exec(trimmedQuery)) !== null) {
    if (match[1].trim()) {
      quotedPhrases.push(match[1].trim());
    }
  }

  // Remove quoted parts to get standalone words
  cleanedQuery = cleanedQuery.replace(quotedRegex, " ").trim();
  const rawTokens = cleanedQuery
    .split(/[\s,;.!?:+]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Combine quoted phrases and tokens
  const allSearchTerms = [...quotedPhrases, ...rawTokens];
  if (allSearchTerms.length === 0) return [];

  for (const page of pages) {
    const pageText = page.text;
    if (!pageText || pageText.trim().length === 0) continue;

    if (options.mode === "regex") {
      // Regex Search Mode
      try {
        const regex = new RegExp(
          trimmedQuery,
          options.caseSensitive ? "g" : "gi"
        );
        const matches = Array.from(pageText.matchAll(regex));

        if (matches.length > 0) {
          const firstMatch = matches[0];
          const matchIndex = firstMatch.index || 0;
          const matchLength = firstMatch[0].length;

          const snippetStart = Math.max(0, matchIndex - 80);
          const snippetEnd = Math.min(pageText.length, matchIndex + matchLength + 80);

          const before = pageText.substring(snippetStart, matchIndex);
          const matchedStr = pageText.substring(matchIndex, matchIndex + matchLength);
          const after = pageText.substring(matchIndex + matchLength, snippetEnd);

          const highlightedSnippet = `${snippetStart > 0 ? "..." : ""}${escapeHtml(
            before
          )}<mark class="bg-yellow-200 dark:bg-yellow-800 text-foreground px-1 py-0.5 rounded font-semibold">${escapeHtml(
            matchedStr
          )}</mark>${escapeHtml(after)}${snippetEnd < pageText.length ? "..." : ""}`;

          results.push({
            fileName: page.fileName,
            pageNumber: page.pageNumber,
            snippet: highlightedSnippet,
            matchCount: matches.length,
            score: matches.length * 10,
            fullText: pageText,
            matchedWords: [firstMatch[0]],
          });
        }
      } catch (e) {
        console.error("Invalid regex in PDF search:", e);
      }
      continue;
    }

    if (options.mode === "exact") {
      // Exact Match Mode
      const flags = options.caseSensitive ? "g" : "gi";
      const pattern = options.wholeWord
        ? `\\b${escapeRegExp(trimmedQuery)}\\b`
        : escapeRegExp(trimmedQuery);
      const regex = new RegExp(pattern, flags);
      const matches = Array.from(pageText.matchAll(regex));

      if (matches.length > 0) {
        const firstMatch = matches[0];
        const matchIndex = firstMatch.index || 0;
        const matchLength = firstMatch[0].length;

        const snippetStart = Math.max(0, matchIndex - 80);
        const snippetEnd = Math.min(pageText.length, matchIndex + matchLength + 80);

        const before = pageText.substring(snippetStart, matchIndex);
        const matchedStr = pageText.substring(matchIndex, matchIndex + matchLength);
        const after = pageText.substring(matchIndex + matchLength, snippetEnd);

        const highlightedSnippet = `${snippetStart > 0 ? "..." : ""}${escapeHtml(
          before
        )}<mark class="bg-yellow-200 dark:bg-yellow-800 text-foreground px-1 py-0.5 rounded font-semibold">${escapeHtml(
          matchedStr
        )}</mark>${escapeHtml(after)}${snippetEnd < pageText.length ? "..." : ""}`;

        results.push({
          fileName: page.fileName,
          pageNumber: page.pageNumber,
          snippet: highlightedSnippet,
          matchCount: matches.length,
          score: 100 + matches.length * 10,
          fullText: pageText,
          matchedWords: [trimmedQuery],
        });
      }
      continue;
    }

    // Smart / NLP Mode (Default)
    // 1. Check exact phrase match first
    const exactRegex = new RegExp(
      escapeRegExp(trimmedQuery),
      options.caseSensitive ? "gi" : "gi"
    );
    const exactMatches = Array.from(pageText.matchAll(exactRegex));

    // 2. Check token occurrences
    const matchedTokens: { token: string; count: number; indices: number[] }[] =
      [];
    let totalScore = 0;
    const foundWords: Set<string> = new Set();

    for (const term of allSearchTerms) {
      if (!term) continue;
      const termRegex = new RegExp(
        options.wholeWord
          ? `\\b${escapeRegExp(term)}\\b`
          : escapeRegExp(term),
        options.caseSensitive ? "g" : "gi"
      );

      const tokenMatches = Array.from(pageText.matchAll(termRegex));
      if (tokenMatches.length > 0) {
        foundWords.add(term);
        matchedTokens.push({
          token: term,
          count: tokenMatches.length,
          indices: tokenMatches.map((m) => m.index || 0),
        });
        totalScore += tokenMatches.length * 10;
      }
    }

    // Must match at least one token
    if (matchedTokens.length === 0) continue;

    // Bonus for exact phrase
    if (exactMatches.length > 0) {
      totalScore += 100 + exactMatches.length * 20;
    }

    // Bonus for matching all search tokens
    if (matchedTokens.length === allSearchTerms.length && allSearchTerms.length > 1) {
      totalScore += 50;
    }

    // Find best cluster position for snippet
    const allIndices = matchedTokens.flatMap((t) => t.indices).sort((a, b) => a - b);
    const primaryIndex = allIndices[0] || 0;

    // Build highlighted snippet
    const snippetStart = Math.max(0, primaryIndex - 80);
    const snippetEnd = Math.min(pageText.length, primaryIndex + 160);
    let snippetRaw = pageText.substring(snippetStart, snippetEnd);

    // Highlight all matched terms in snippet
    const highlightPattern = new RegExp(
      allSearchTerms.map((t) => escapeRegExp(t)).join("|"),
      options.caseSensitive ? "g" : "gi"
    );

    let highlightedSnippet = escapeHtml(snippetRaw).replace(
      highlightPattern,
      (match) =>
        `<mark class="bg-yellow-200 dark:bg-yellow-800 text-foreground px-1 py-0.5 rounded font-semibold">${match}</mark>`
    );

    if (snippetStart > 0) highlightedSnippet = "..." + highlightedSnippet;
    if (snippetEnd < pageText.length) highlightedSnippet = highlightedSnippet + "...";

    const totalMatchCount = matchedTokens.reduce((sum, t) => sum + t.count, 0);

    results.push({
      fileName: page.fileName,
      pageNumber: page.pageNumber,
      snippet: highlightedSnippet,
      matchCount: totalMatchCount,
      score: totalScore,
      fullText: pageText,
      matchedWords: Array.from(foundWords),
    });
  }

  // Sort results by relevance score descending
  return results.sort((a, b) => b.score - a.score);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
