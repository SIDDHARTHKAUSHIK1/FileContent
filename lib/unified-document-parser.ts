import mammoth from "mammoth"
import JSZip from "jszip"
import { parseStringPromise } from "xml2js"
import * as XLSX from "xlsx"

export interface ParsedPage {
  pageNumber: number
  title?: string
  content: string
}

export interface UnifiedDocument {
  id: string
  name: string
  path: string
  size: number
  type: "pdf" | "word" | "spreadsheet" | "presentation" | "code" | "text" | "other"
  extension: string
  content: string
  pages?: ParsedPage[]
  lineCount: number
  wordCount: number
  lastModified: number
  rawFile?: File
}

export interface SearchMatchItem {
  id: string
  documentId: string
  documentName: string
  documentPath: string
  documentType: "pdf" | "word" | "spreadsheet" | "presentation" | "code" | "text" | "other"
  extension: string
  pageOrSection?: string
  lineNumber?: number
  matchText: string
  beforeContext: string
  afterContext: string
  fullSnippet: string
}

export interface SearchFilterOptions {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  selectedTypes?: string[] // e.g. ["pdf", "word", "code", "text", "spreadsheet", "presentation"]
}

export const SUPPORTED_EXTENSIONS_MAP: Record<string, { type: UnifiedDocument["type"]; label: string; iconName: string; color: string }> = {
  pdf: { type: "pdf", label: "PDF Document", iconName: "FileText", color: "text-red-500 bg-red-500/10 border-red-500/20" },
  docx: { type: "word", label: "Word Document", iconName: "FileText", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  doc: { type: "word", label: "Legacy Word", iconName: "FileText", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  pptx: { type: "presentation", label: "PowerPoint", iconName: "Presentation", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  xlsx: { type: "spreadsheet", label: "Excel Sheet", iconName: "Table", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  xls: { type: "spreadsheet", label: "Legacy Excel", iconName: "Table", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  csv: { type: "spreadsheet", label: "CSV Data", iconName: "Table", color: "text-teal-500 bg-teal-500/10 border-teal-500/20" },
  tsv: { type: "spreadsheet", label: "TSV Data", iconName: "Table", color: "text-teal-400 bg-teal-400/10 border-teal-400/20" },
  txt: { type: "text", label: "Text File", iconName: "FileText", color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20" },
  md: { type: "text", label: "Markdown", iconName: "FileText", color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  log: { type: "text", label: "Log File", iconName: "FileText", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  rtf: { type: "text", label: "Rich Text", iconName: "FileText", color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20" },
  json: { type: "code", label: "JSON Data", iconName: "Code", color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" },
  xml: { type: "code", label: "XML Data", iconName: "Code", color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
  yaml: { type: "code", label: "YAML Config", iconName: "Code", color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  yml: { type: "code", label: "YAML Config", iconName: "Code", color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  js: { type: "code", label: "JavaScript", iconName: "Code", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  jsx: { type: "code", label: "React JSX", iconName: "Code", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  ts: { type: "code", label: "TypeScript", iconName: "Code", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  tsx: { type: "code", label: "React TSX", iconName: "Code", color: "text-sky-500 bg-sky-500/10 border-sky-500/20" },
  py: { type: "code", label: "Python", iconName: "Code", color: "text-green-500 bg-green-500/10 border-green-500/20" },
  java: { type: "code", label: "Java", iconName: "Code", color: "text-red-600 bg-red-600/10 border-red-600/20" },
  cpp: { type: "code", label: "C++", iconName: "Code", color: "text-blue-600 bg-blue-600/10 border-blue-600/20" },
  c: { type: "code", label: "C Source", iconName: "Code", color: "text-blue-600 bg-blue-600/10 border-blue-600/20" },
  cs: { type: "code", label: "C#", iconName: "Code", color: "text-violet-600 bg-violet-600/10 border-violet-600/20" },
  go: { type: "code", label: "Go", iconName: "Code", color: "text-cyan-600 bg-cyan-600/10 border-cyan-600/20" },
  rs: { type: "code", label: "Rust", iconName: "Code", color: "text-orange-600 bg-orange-600/10 border-orange-600/20" },
  html: { type: "code", label: "HTML", iconName: "Code", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  css: { type: "code", label: "CSS", iconName: "Code", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  sql: { type: "code", label: "SQL Query", iconName: "Code", color: "text-purple-600 bg-purple-600/10 border-purple-600/20" },
  sh: { type: "code", label: "Shell Script", iconName: "Code", color: "text-emerald-600 bg-emerald-600/10 border-emerald-600/20" },
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".")
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ""
}

export function isFileSupported(filename: string): boolean {
  const ext = getFileExtension(filename)
  return Boolean(SUPPORTED_EXTENSIONS_MAP[ext])
}

export function getFileTypeCategory(filename: string): UnifiedDocument["type"] {
  const ext = getFileExtension(filename)
  return SUPPORTED_EXTENSIONS_MAP[ext]?.type || "other"
}

export class UnifiedDocumentParser {
  static async parseFile(file: File, relativePath?: string): Promise<UnifiedDocument> {
    const extension = getFileExtension(file.name)
    const type = getFileTypeCategory(file.name)
    const path = relativePath || (file as any).webkitRelativePath || file.name
    const id = `${file.name}-${file.size}-${file.lastModified}`

    let content = ""
    let pages: ParsedPage[] = []

    try {
      if (extension === "pdf") {
        const result = await this.parsePdf(file)
        content = result.content
        pages = result.pages
      } else if (extension === "docx" || extension === "doc") {
        const result = await this.parseWord(file)
        content = result.content
        pages = result.pages
      } else if (extension === "pptx") {
        const result = await this.parsePptx(file)
        content = result.content
        pages = result.pages
      } else if (extension === "xlsx" || extension === "xls" || extension === "csv" || extension === "tsv") {
        const result = await this.parseSpreadsheet(file)
        content = result.content
        pages = result.pages
      } else {
        // Plain text / Code files
        content = await this.readAsText(file)
      }
    } catch (err) {
      console.warn(`Error parsing file ${file.name}:`, err)
      content = `[Notice: File "${file.name}" content could not be fully decoded: ${err instanceof Error ? err.message : String(err)}]`
    }

    const lines = content.split("\n")
    const words = content.trim().split(/\s+/).filter(Boolean)

    return {
      id,
      name: file.name,
      path,
      size: file.size,
      type,
      extension,
      content,
      pages: pages.length > 0 ? pages : undefined,
      lineCount: lines.length,
      wordCount: words.length,
      lastModified: file.lastModified,
      rawFile: file,
    }
  }

  private static async readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string) || "")
      reader.onerror = () => reject(new Error("Unable to read file content."))
      reader.readAsText(file)
    })
  }

  private static async parsePdf(file: File): Promise<{ content: string; pages: ParsedPage[] }> {
    const arrayBuffer = await file.arrayBuffer()
    const pdfjs = await import("pdfjs-dist")
    
    if (typeof window !== "undefined" && "Worker" in window && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"
    }

    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const pages: ParsedPage[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      let pageText = textContent.items.map((item: any) => item.str || "").join(" ").trim()

      // If page has very little or no selectable text, attempt OCR if on client
      if (pageText.length < 20 && typeof window !== "undefined") {
        try {
          const tesseract = (await import("tesseract.js")).default
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise
            const ocrResult = await tesseract.recognize(canvas.toDataURL(), "eng")
            if (ocrResult.data?.text?.trim()) {
              pageText = (pageText ? pageText + "\n" : "") + ocrResult.data.text.trim()
            }
          }
        } catch (ocrErr) {
          console.warn("OCR fallback note:", ocrErr)
        }
      }

      pages.push({
        pageNumber: pageNum,
        title: `Page ${pageNum}`,
        content: pageText,
      })
    }

    const fullContent = pages.map((p) => `--- ${p.title} ---\n${p.content}`).join("\n\n")
    return { content: fullContent, pages }
  }

  private static async parseWord(file: File): Promise<{ content: string; pages: ParsedPage[] }> {
    const arrayBuffer = await file.arrayBuffer()
    const ext = getFileExtension(file.name)

    if (ext === "doc") {
      const text = await this.readAsText(file)
      // Extract printable characters for legacy doc
      const printable = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim()
      return { content: printable || "[Legacy .doc file with binary formatting]", pages: [] }
    }

    const result = await mammoth.extractRawText({ arrayBuffer })
    const fullText = result.value.trim()

    // Approximate pages (500 words per page)
    const paragraphs = fullText.split(/\n\n+/)
    const pages: ParsedPage[] = []
    let currentPageContent = ""
    let pageNumber = 1

    for (const para of paragraphs) {
      if (currentPageContent.length + para.length > 2500 && currentPageContent.length > 0) {
        pages.push({
          pageNumber,
          title: `Section / Page ${pageNumber}`,
          content: currentPageContent.trim(),
        })
        pageNumber++
        currentPageContent = para + "\n\n"
      } else {
        currentPageContent += para + "\n\n"
      }
    }

    if (currentPageContent.trim()) {
      pages.push({
        pageNumber,
        title: `Section / Page ${pageNumber}`,
        content: currentPageContent.trim(),
      })
    }

    return { content: fullText, pages }
  }

  private static async parsePptx(file: File): Promise<{ content: string; pages: ParsedPage[] }> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const slideNames = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]))

    const pages: ParsedPage[] = []

    for (const [index, slideName] of slideNames.entries()) {
      const slideFile = zip.files[slideName]
      if (!slideFile) continue
      const slide = await parseStringPromise(await slideFile.async("string"))
      const textArr: string[] = []

      const collectText = (val: unknown): void => {
        if (typeof val === "string") textArr.push(val)
        else if (Array.isArray(val)) val.forEach(collectText)
        else if (val && typeof val === "object") Object.values(val).forEach(collectText)
      }

      collectText(slide["p:sld"])
      const slideText = textArr.join(" ").trim()
      pages.push({
        pageNumber: index + 1,
        title: `Slide ${index + 1}`,
        content: slideText,
      })
    }

    const fullContent = pages.map((p) => `--- ${p.title} ---\n${p.content}`).join("\n\n")
    return { content: fullContent, pages }
  }

  private static async parseSpreadsheet(file: File): Promise<{ content: string; pages: ParsedPage[] }> {
    const arrayBuffer = await file.arrayBuffer()
    const ext = getFileExtension(file.name)

    if (ext === "csv" || ext === "tsv") {
      const text = await this.readAsText(file)
      return {
        content: text,
        pages: [{ pageNumber: 1, title: file.name, content: text }],
      }
    }

    const workbook = XLSX.read(arrayBuffer, { type: "array" })
    const pages: ParsedPage[] = []

    for (const [idx, sheetName] of workbook.SheetNames.entries()) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      pages.push({
        pageNumber: idx + 1,
        title: `Sheet: ${sheetName}`,
        content: csv,
      })
    }

    const fullContent = pages.map((p) => `--- ${p.title} ---\n${p.content}`).join("\n\n")
    return { content: fullContent, pages }
  }
}

export function searchUnifiedDocuments(
  documents: UnifiedDocument[],
  query: string,
  options: SearchFilterOptions
): SearchMatchItem[] {
  const cleanQuery = query.trim()
  if (!cleanQuery) return []

  const filteredDocs = options.selectedTypes && options.selectedTypes.length > 0
    ? documents.filter((doc) => options.selectedTypes!.includes(doc.type))
    : documents

  let regex: RegExp
  try {
    if (options.useRegex) {
      regex = new RegExp(cleanQuery, options.caseSensitive ? "g" : "gi")
    } else {
      const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped
      regex = new RegExp(pattern, options.caseSensitive ? "g" : "gi")
    }
  } catch {
    return []
  }

  const results: SearchMatchItem[] = []

  for (const doc of filteredDocs) {
    if (doc.pages && doc.pages.length > 0) {
      // Document has structured pages / slides / sheets
      for (const page of doc.pages) {
        const lines = page.content.split("\n")
        lines.forEach((line, lineIndex) => {
          regex.lastIndex = 0
          let match: RegExpExecArray | null
          while ((match = regex.exec(line)) !== null) {
            const startIdx = Math.max(0, match.index - 60)
            const endIdx = Math.min(line.length, match.index + match[0].length + 60)
            const before = line.slice(startIdx, match.index)
            const matchedStr = match[0]
            const after = line.slice(match.index + matchedStr.length, endIdx)

            results.push({
              id: `${doc.id}-${page.pageNumber}-${lineIndex}-${match.index}`,
              documentId: doc.id,
              documentName: doc.name,
              documentPath: doc.path,
              documentType: doc.type,
              extension: doc.extension,
              pageOrSection: page.title || `Page ${page.pageNumber}`,
              lineNumber: lineIndex + 1,
              matchText: matchedStr,
              beforeContext: startIdx > 0 ? `…${before}` : before,
              afterContext: endIdx < line.length ? `${after}…` : after,
              fullSnippet: line.trim(),
            })

            if (match.index === regex.lastIndex) regex.lastIndex++
          }
        })
      }
    } else {
      // Plain text or code file
      const lines = doc.content.split("\n")
      lines.forEach((line, lineIndex) => {
        regex.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = regex.exec(line)) !== null) {
          const startIdx = Math.max(0, match.index - 60)
          const endIdx = Math.min(line.length, match.index + match[0].length + 60)
          const before = line.slice(startIdx, match.index)
          const matchedStr = match[0]
          const after = line.slice(match.index + matchedStr.length, endIdx)

          results.push({
            id: `${doc.id}-${lineIndex}-${match.index}`,
            documentId: doc.id,
            documentName: doc.name,
            documentPath: doc.path,
            documentType: doc.type,
            extension: doc.extension,
            lineNumber: lineIndex + 1,
            matchText: matchedStr,
            beforeContext: startIdx > 0 ? `…${before}` : before,
            afterContext: endIdx < line.length ? `${after}…` : after,
            fullSnippet: line.trim(),
          })

          if (match.index === regex.lastIndex) regex.lastIndex++
        }
      })
    }
  }

  return results
}
