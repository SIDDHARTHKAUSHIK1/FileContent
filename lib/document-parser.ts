import mammoth from "mammoth"
import JSZip from "jszip"
import Tesseract from "tesseract.js"

export interface DocumentSection {
  level: number
  title: string
  startIndex: number
  endIndex: number
}

export interface DocumentPage {
  pageNumber: number
  content: string
  startIndex: number
  endIndex: number
  sections: DocumentSection[]
  lineCount: number
}

export interface SearchMatch {
  text: string
  startIndex: number
  endIndex: number
  pageNumber: number
  lineNumber: number
  sectionTitle?: string
  context: string
  beforeContext: string
  afterContext: string
}

export interface DocumentLayout {
  text: string
  pages: DocumentPage[]
  sections: DocumentSection[]
  totalPages: number
  wordCount: number
  characterCount: number
  isValidDocx?: boolean
}

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useWildcards: boolean
  useRegex: boolean
  searchBackwards: boolean
}

export class DocumentParser {
  private static readonly CHARS_PER_LINE = 80
  private static readonly LINES_PER_PAGE = 50
  private static readonly CHARS_PER_PAGE = DocumentParser.CHARS_PER_LINE * DocumentParser.LINES_PER_PAGE

  private static async loadZipSafe(buffer: ArrayBuffer): Promise<JSZip | null> {
    try {
      const zip = await JSZip.loadAsync(buffer)
      return zip
    } catch (err) {
      console.warn("Failed to load zip archive safely:", err)
      return null
    }
  }

  static async parseDocument(file: File): Promise<DocumentLayout> {
    const fileName = file.name.toLowerCase()
    let text = ""
    let htmlContent = ""
    let zip: JSZip | null = null

    if (fileName.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer()

      // Extract both text and HTML for better structure detection
      const textResult = await mammoth.extractRawText({ arrayBuffer })
      text = textResult.value

      try {
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer })
        htmlContent = htmlResult.value
      } catch (e) {
        console.log("Could not extract HTML from docx")
      }

      // Extract images and perform OCR to get text from images
      let ocrText = ""
      try {
        try {
          function isValidZip(buffer: ArrayBuffer): boolean {
            const signature = new Uint8Array(buffer.slice(0, 4))
            // ZIP files start with "PK\x03\x04" or "PK\x05\x06" or "PK\x07\x08"
            return (
              signature[0] === 0x50 &&
              signature[1] === 0x4b &&
              (signature[2] === 0x03 || signature[2] === 0x05 || signature[2] === 0x07) &&
              (signature[3] === 0x04 || signature[3] === 0x06 || signature[3] === 0x08)
            )
          }

          if (!isValidZip(arrayBuffer)) {
            console.warn("DOCX file does not have a valid ZIP signature. Skipping image extraction.")
            zip = null
          } else {
            zip = await this.loadZipSafe(arrayBuffer)
          }

          if (zip) {
            const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"))

            for (const mediaName of mediaFiles) {
              const fileData = await zip.files[mediaName].async("base64")
              const ext = mediaName.split('.').pop()?.toLowerCase() || 'png'
              const dataUrl = `data:image/${ext};base64,${fileData}`

              try {
                const result = await Tesseract.recognize(dataUrl, 'eng', {
                  logger: (m) => {
                    // Optional: log OCR progress
                    // console.log(`OCR progress for ${mediaName}:`, m)
                  },
                })
                if (result.data && result.data.text) {
                  ocrText += '\\n' + result.data.text
                }
              } catch (ocrErr) {
                console.warn('OCR failed for DOCX image', ocrErr)
              }
            }
          }
        } catch (e) {
          console.warn("DOCX image extraction failed", e)
        }
      } catch (e) {
        console.warn("Unexpected error during DOCX image extraction", e)
      }

      if (ocrText.trim().length > 0) {
        text += '\\n' + ocrText
      }
    } else if (fileName.endsWith(".doc")) {
      text = await this.extractDocText(file)
    } else if (fileName.endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer()
      let ocrText = ""
      let extractedText = ""
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        // @ts-ignore
        const pdfjsLib = await import("pdfjs-dist")
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        }
        const pdf = await pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || "5.3.93"}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || "5.3.93"}/standard_fonts/`,
        }).promise
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()
          const pageText = textContent.items
            .filter((item: any) => typeof item.str === "string")
            .map((item: any) => item.str + (item.hasEOL ? "\n" : " "))
            .join("")
          extractedText += `\n${pageText}`
        }
        text = extractedText.trim()
      } else {
        // SSR/server: skip PDF parsing, return placeholder
        return {
          text: "[PDF parsing with OCR is only available in the browser.]",
          pages: [],
          sections: [],
          totalPages: 0,
          wordCount: 0,
          characterCount: 0,
        }
      }
    } else {
      // Plain text file
      text = await this.readTextFile(file)
    }

    // Clean and normalize text
    text = this.normalizeText(text)

    // Detect document structure
    const sections = this.detectSections(text, htmlContent)
    const pages = this.simulatePageLayout(text, sections)

    return {
      text,
      pages,
      sections,
      totalPages: pages.length,
      wordCount: text.split(/\s+/).filter((word) => word.length > 0).length,
      characterCount: text.length,
      isValidDocx: zip !== null,
    }
  }

  private static async extractDocText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()

    try {
      const result = await mammoth.extractRawText({ arrayBuffer })
      if (result.value && result.value.trim().length > 0) {
        return result.value
      }
    } catch (e) {
      console.log("Mammoth failed for .doc file")
    }

    // Fallback binary extraction
    const uint8Array = new Uint8Array(arrayBuffer)
    let extractedText = ""

    for (let i = 0; i < uint8Array.length; i++) {
      const char = uint8Array[i]
      if ((char >= 32 && char <= 126) || char === 10 || char === 13 || char === 9) {
        extractedText += String.fromCharCode(char)
      } else if (char === 12) {
        extractedText += "\f" // Page break
      }
    }

    return this.normalizeText(extractedText)
  }

  private static async readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve((e.target?.result as string) || "")
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  private static normalizeText(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ").trim()
  }

  private static detectSections(text: string, htmlContent?: string): DocumentSection[] {
    const sections: DocumentSection[] = []
    const lines = text.split("\n")

    // Pattern 1: HTML headings (most reliable for .docx)
    if (htmlContent) {
      const headingMatches = htmlContent.matchAll(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi)
      for (const match of headingMatches) {
        const level = Number.parseInt(match[1])
        const title = match[2].replace(/<[^>]*>/g, "").trim()

        // Find this heading in the plain text
        const textIndex = text.toLowerCase().indexOf(title.toLowerCase())
        if (textIndex !== -1) {
          sections.push({
            level,
            title,
            startIndex: textIndex,
            endIndex: textIndex + title.length,
          })
        }
      }
    }

    // Pattern 2: Common heading patterns in plain text
    const headingPatterns = [
      /^(Chapter|Section|Part)\s+\d+[:\-\s](.+)$/i,
      /^(\d+\.?\d*\.?\d*)\s+(.+)$/,
      /^([A-Z][A-Z\s]{2,})$/,
      /^(.{1,50})\s*\n\s*[=-]{3,}\s*$/m,
    ]

    let currentIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const lineStart = currentIndex
      currentIndex += lines[i].length + 1 // +1 for newline

      if (line.length === 0) continue

      for (const pattern of headingPatterns) {
        const match = line.match(pattern)
        if (match) {
          const title = match[2] || match[1] || line
          const level = this.determineHeadingLevel(line, match)

          sections.push({
            level,
            title: title.trim(),
            startIndex: lineStart,
            endIndex: lineStart + line.length,
          })
          break
        }
      }

      // Pattern 3: Lines that are short, capitalized, and followed by content
      if (
        line.length > 5 &&
        line.length < 60 &&
        line === line.toUpperCase() &&
        i < lines.length - 1 &&
        lines[i + 1].trim().length > 0
      ) {
        sections.push({
          level: 2,
          title: line,
          startIndex: lineStart,
          endIndex: lineStart + line.length,
        })
      }
    }

    return sections.sort((a, b) => a.startIndex - b.startIndex)
  }

  private static determineHeadingLevel(line: string, match: RegExpMatchArray): number {
    // Numbered headings (1.1.1 = level 3)
    if (match[1] && /^\d+\./.test(match[1])) {
      const dots = (match[1].match(/\./g) || []).length
      return Math.min(dots + 1, 6)
    }

    // All caps = level 1
    if (line === line.toUpperCase()) {
      return 1
    }

    // Chapter/Section = level 1
    if (/^(Chapter|Section|Part)/i.test(line)) {
      return 1
    }

    return 2
  }

  private static simulatePageLayout(text: string, sections: DocumentSection[]): DocumentPage[] {
    const pages: DocumentPage[] = []
    const lines = text.split("\n")

    let currentPageLines: string[] = []
    let currentPageStartIndex = 0
    let currentCharIndex = 0
    let pageNumber = 1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineLength = line.length + 1 // +1 for newline

      // Check if adding this line would exceed page capacity
      if (
        currentPageLines.length >= this.LINES_PER_PAGE ||
        currentPageLines.join("\n").length + lineLength > this.CHARS_PER_PAGE
      ) {
        // Create current page
        if (currentPageLines.length > 0) {
          const pageContent = currentPageLines.join("\n")
          const pageEndIndex = currentPageStartIndex + pageContent.length

          pages.push({
            pageNumber,
            content: pageContent,
            startIndex: currentPageStartIndex,
            endIndex: pageEndIndex,
            sections: this.getPageSections(sections, currentPageStartIndex, pageEndIndex),
            lineCount: currentPageLines.length,
          })

          pageNumber++
          currentPageStartIndex = pageEndIndex + 1
          currentPageLines = []
        }
      }

      // Handle explicit page breaks
      if (line.includes("\f")) {
        const parts = line.split("\f")
        currentPageLines.push(parts[0])

        // Create page with content before page break
        if (currentPageLines.length > 0) {
          const pageContent = currentPageLines.join("\n")
          const pageEndIndex = currentPageStartIndex + pageContent.length

          pages.push({
            pageNumber,
            content: pageContent,
            startIndex: currentPageStartIndex,
            endIndex: pageEndIndex,
            sections: this.getPageSections(sections, currentPageStartIndex, pageEndIndex),
            lineCount: currentPageLines.length,
          })

          pageNumber++
          currentPageStartIndex = pageEndIndex + 1
          currentPageLines = []
        }

        // Start new page with content after page break
        if (parts[1]) {
          currentPageLines.push(parts[1])
        }
      } else {
        currentPageLines.push(line)
      }

      currentCharIndex += lineLength
    }

    // Add the last page
    if (currentPageLines.length > 0) {
      const pageContent = currentPageLines.join("\n")
      const pageEndIndex = currentPageStartIndex + pageContent.length

      pages.push({
        pageNumber,
        content: pageContent,
        startIndex: currentPageStartIndex,
        endIndex: pageEndIndex,
        sections: this.getPageSections(sections, currentPageStartIndex, pageEndIndex),
        lineCount: currentPageLines.length,
      })
    }

    return pages
  }

  private static getPageSections(sections: DocumentSection[], pageStart: number, pageEnd: number): DocumentSection[] {
    return sections.filter(
      (section) =>
        (section.startIndex >= pageStart && section.startIndex <= pageEnd) ||
        (section.endIndex >= pageStart && section.endIndex <= pageEnd) ||
        (section.startIndex <= pageStart && section.endIndex >= pageEnd),
    )
  }

  static searchDocument(layout: DocumentLayout, query: string, options: SearchOptions): SearchMatch[] {
    const matches: SearchMatch[] = []

    if (!query.trim()) return matches

    let searchPattern: RegExp

    try {
      if (options.useRegex) {
        searchPattern = new RegExp(query, options.matchCase ? "g" : "gi")
      } else if (options.useWildcards) {
        // Convert wildcards to regex
        const regexQuery = query
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex chars
          .replace(/\\\*/g, ".*") // * becomes .*
          .replace(/\\\?/g, ".") // ? becomes .

        const pattern = options.wholeWord ? `\\b${regexQuery}\\b` : regexQuery
        searchPattern = new RegExp(pattern, options.matchCase ? "g" : "gi")
      } else {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const pattern = options.wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery
        searchPattern = new RegExp(pattern, options.matchCase ? "g" : "gi")
      }
    } catch (e) {
      console.error("Invalid search pattern:", e)
      return matches
    }

    const text = layout.text
    let match: RegExpExecArray | null

    while ((match = searchPattern.exec(text)) !== null) {
      const matchStart = match.index
      const matchEnd = matchStart + match[0].length

      // Find which page contains this match
      const page = layout.pages.find((p) => matchStart >= p.startIndex && matchStart <= p.endIndex)

      if (!page) continue

      // Find line number within the page
      const textBeforeMatch = text.substring(0, matchStart)
      const lineNumber = (textBeforeMatch.match(/\n/g) || []).length + 1

      // Find section
      const section = layout.sections
        .filter((s) => matchStart >= s.startIndex && matchStart <= s.endIndex)
        .sort((a, b) => b.level - a.level)[0] // Get the most specific section

      // Extract context
      const contextStart = Math.max(0, matchStart - 100)
      const contextEnd = Math.min(text.length, matchEnd + 100)
      const fullContext = text.substring(contextStart, contextEnd)

      const beforeContext = text.substring(contextStart, matchStart)
      const afterContext = text.substring(matchEnd, contextEnd)

      matches.push({
        text: match[0],
        startIndex: matchStart,
        endIndex: matchEnd,
        pageNumber: page.pageNumber,
        lineNumber,
        sectionTitle: section?.title,
        context: fullContext,
        beforeContext,
        afterContext,
      })

      // Prevent infinite loop with zero-width matches
      if (match[0].length === 0) {
        searchPattern.lastIndex++
      }
    }

    return options.searchBackwards ? matches.reverse() : matches
  }
}

export interface AdvancedSearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useWildcards: boolean
  useRegex: boolean
  searchBackwards: boolean
}

export class AdvancedDocumentParser {
  private static readonly CHARS_PER_LINE = 80
  private static readonly LINES_PER_PAGE = 50
  private static readonly CHARS_PER_PAGE = AdvancedDocumentParser.CHARS_PER_LINE * AdvancedDocumentParser.LINES_PER_PAGE

  static async parseDocumentAdvanced(file: File): Promise<DocumentLayout> {
    const fileName = file.name.toLowerCase()
    let text = ""
    let htmlContent = ""

    if (fileName.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer()
      const textResult = await mammoth.extractRawText({ arrayBuffer })
      text = textResult.value

      try {
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer })
        htmlContent = htmlResult.value
      } catch (e) {
        console.log("Could not extract HTML from docx")
      }
    } else if (fileName.endsWith(".doc")) {
      text = await this.extractDocTextAdvanced(file)
    } else {
      text = await this.readTextFileAdvanced(file)
    }

    text = this.normalizeText(text)
    const sections = this.detectSections(text, htmlContent)
    const pages = this.simulatePageLayout(text, sections)

    return {
      text,
      pages,
      sections,
      totalPages: pages.length,
      wordCount: text.split(/\s+/).filter((word) => word.length > 0).length,
      characterCount: text.length,
    }
  }

  private static async extractDocTextAdvanced(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()

    try {
      const result = await mammoth.extractRawText({ arrayBuffer })
      if (result.value && result.value.trim().length > 0) {
        return result.value
      }
    } catch (e) {
      console.log("Mammoth failed for .doc file")
    }

    const uint8Array = new Uint8Array(arrayBuffer)
    let extractedText = ""

    for (let i = 0; i < uint8Array.length; i++) {
      const char = uint8Array[i]
      if ((char >= 32 && char <= 126) || char === 10 || char === 13 || char === 9) {
        extractedText += String.fromCharCode(char)
      } else if (char === 12) {
        extractedText += "\f"
      }
    }

    return this.normalizeText(extractedText)
  }

  private static async readTextFileAdvanced(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve((e.target?.result as string) || "")
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  private static normalizeText(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ").trim()
  }

  private static detectSections(text: string, htmlContent?: string): DocumentSection[] {
    const sections: DocumentSection[] = []
    const lines = text.split("\n")

    if (htmlContent) {
      const headingMatches = htmlContent.matchAll(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi)
      for (const match of headingMatches) {
        const level = Number.parseInt(match[1])
        const title = match[2].replace(/<[^>]*>/g, "").trim()
        const textIndex = text.toLowerCase().indexOf(title.toLowerCase())
        if (textIndex !== -1) {
          sections.push({
            level,
            title,
            startIndex: textIndex,
            endIndex: textIndex + title.length,
          })
        }
      }
    }

    const headingPatterns = [
      /^(Chapter|Section|Part)\s+\d+[:\-\s](.+)$/i,
      /^(\d+\.?\d*\.?\d*)\s+(.+)$/,
      /^([A-Z][A-Z\s]{2,})$/,
      /^(.{1,50})\s*\n\s*[=-]{3,}\s*$/m,
    ]

    let currentIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const lineStart = currentIndex
      currentIndex += lines[i].length + 1

      if (line.length === 0) continue

      for (const pattern of headingPatterns) {
        const match = line.match(pattern)
        if (match) {
          const title = match[2] || match[1] || line
          const level = this.determineHeadingLevel(line, match)

          sections.push({
            level,
            title: title.trim(),
            startIndex: lineStart,
            endIndex: lineStart + line.length,
          })
          break
        }
      }
    }

    return sections.sort((a, b) => a.startIndex - b.startIndex)
  }

  private static determineHeadingLevel(line: string, match: RegExpMatchArray): number {
    if (match[1] && /^\d+\./.test(match[1])) {
      const dots = (match[1].match(/\./g) || []).length
      return Math.min(dots + 1, 6)
    }
    if (line === line.toUpperCase()) return 1
    if (/^(Chapter|Section|Part)/i.test(line)) return 1
    return 2
  }

  private static simulatePageLayout(text: string, sections: DocumentSection[]): DocumentPage[] {
    const pages: DocumentPage[] = []
    const lines = text.split("\n")

    let currentPageLines: string[] = []
    let currentPageStartIndex = 0
    let pageNumber = 1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineLength = line.length + 1

      if (
        currentPageLines.length >= this.LINES_PER_PAGE ||
        currentPageLines.join("\n").length + lineLength > this.CHARS_PER_PAGE
      ) {
        if (currentPageLines.length > 0) {
          const pageContent = currentPageLines.join("\n")
          const pageEndIndex = currentPageStartIndex + pageContent.length

          pages.push({
            pageNumber,
            content: pageContent,
            startIndex: currentPageStartIndex,
            endIndex: pageEndIndex,
            sections: this.getPageSections(sections, currentPageStartIndex, pageEndIndex),
            lineCount: currentPageLines.length,
          })

          pageNumber++
          currentPageStartIndex = pageEndIndex + 1
          currentPageLines = []
        }
      }

      if (line.includes("\f")) {
        const parts = line.split("\f")
        currentPageLines.push(parts[0])

        if (currentPageLines.length > 0) {
          const pageContent = currentPageLines.join("\n")
          const pageEndIndex = currentPageStartIndex + pageContent.length

          pages.push({
            pageNumber,
            content: pageContent,
            startIndex: currentPageStartIndex,
            endIndex: pageEndIndex,
            sections: this.getPageSections(sections, currentPageStartIndex, pageEndIndex),
            lineCount: currentPageLines.length,
          })

          pageNumber++
          currentPageStartIndex = pageEndIndex + 1
          currentPageLines = []
        }

        if (parts[1]) {
          currentPageLines.push(parts[1])
        }
      } else {
        currentPageLines.push(line)
      }
    }

    if (currentPageLines.length > 0) {
      const pageContent = currentPageLines.join("\n")
      const pageEndIndex = currentPageStartIndex + pageContent.length

      pages.push({
        pageNumber,
        content: pageContent,
        startIndex: currentPageStartIndex,
        endIndex: pageEndIndex,
        sections: this.getPageSections(sections, currentPageStartIndex, pageEndIndex),
        lineCount: currentPageLines.length,
      })
    }

    return pages
  }

  private static getPageSections(sections: DocumentSection[], pageStart: number, pageEnd: number): DocumentSection[] {
    return sections.filter(
      (section) =>
        (section.startIndex >= pageStart && section.startIndex <= pageEnd) ||
        (section.endIndex >= pageStart && section.endIndex <= pageEnd) ||
        (section.startIndex <= pageStart && section.endIndex >= pageEnd),
    )
  }

  static searchDocumentAdvanced(layout: DocumentLayout, query: string, options: AdvancedSearchOptions): SearchMatch[] {
    const matches: SearchMatch[] = []

    if (!query.trim()) return matches

    let searchPattern: RegExp

    try {
      if (options.useRegex) {
        searchPattern = new RegExp(query, options.matchCase ? "g" : "gi")
      } else if (options.useWildcards) {
        const regexQuery = query
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\\\*/g, ".*")
          .replace(/\\\?/g, ".")

        const pattern = options.wholeWord ? `\\b${regexQuery}\\b` : regexQuery
        searchPattern = new RegExp(pattern, options.matchCase ? "g" : "gi")
      } else {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const pattern = options.wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery
        searchPattern = new RegExp(pattern, options.matchCase ? "g" : "gi")
      }
    } catch (e) {
      console.error("Invalid search pattern:", e)
      return matches
    }

    const text = layout.text
    let match: RegExpExecArray | null

    while ((match = searchPattern.exec(text)) !== null) {
      const matchStart = match.index
      const matchEnd = matchStart + match[0].length

      const page = layout.pages.find((p) => matchStart >= p.startIndex && matchStart <= p.endIndex)
      if (!page) continue

      const textBeforeMatch = text.substring(0, matchStart)
      const lineNumber = (textBeforeMatch.match(/\n/g) || []).length + 1

      const section = layout.sections
        .filter((s) => matchStart >= s.startIndex && matchStart <= s.endIndex)
        .sort((a, b) => b.level - a.level)[0]

      const contextStart = Math.max(0, matchStart - 100)
      const contextEnd = Math.min(text.length, matchEnd + 100)
      const fullContext = text.substring(contextStart, contextEnd)

      const beforeContext = text.substring(contextStart, matchStart)
      const afterContext = text.substring(matchEnd, contextEnd)

      matches.push({
        text: match[0],
        startIndex: matchStart,
        endIndex: matchEnd,
        pageNumber: page.pageNumber,
        lineNumber,
        sectionTitle: section?.title,
        context: fullContext,
        beforeContext,
        afterContext,
      })

      if (match[0].length === 0) {
        searchPattern.lastIndex++
      }
    }

    return options.searchBackwards ? matches.reverse() : matches
  }
}
