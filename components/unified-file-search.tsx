"use client"

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react"
import {
  Search,
  Upload,
  FolderOpen,
  FileText,
  Table,
  Presentation,
  Code,
  Layers,
  Sparkles,
  X,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
  SlidersHorizontal,
  UploadCloud,
  ChevronDown,
  Eye,
  BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  UnifiedDocumentParser,
  searchUnifiedDocuments,
  type UnifiedDocument,
  type SearchMatchItem,
  type SearchFilterOptions,
} from "@/lib/unified-document-parser"
import AISearchChat from "@/components/ai-search-chat"
import type { RagDocumentInput } from "@/lib/rag-types"

const MATCHES_PER_PAGE = 50

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function getIconForType(type: UnifiedDocument["type"]) {
  switch (type) {
    case "pdf":
    case "word":
      return FileText
    case "spreadsheet":
      return Table
    case "presentation":
      return Presentation
    case "code":
      return Code
    case "text":
    default:
      return Layers
  }
}

function getBadgeStyleForType(type: UnifiedDocument["type"]): string {
  switch (type) {
    case "pdf":
      return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
    case "word":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
    case "spreadsheet":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
    case "presentation":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
    case "code":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
    case "text":
    default:
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
  }
}

export function UnifiedFileSearch() {
  const [documents, setDocuments] = useState<UnifiedDocument[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>("")
  const [isGlobalDragging, setIsGlobalDragging] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(MATCHES_PER_PAGE)
  const [activeTab, setActiveTab] = useState<"search" | "ai">("search")

  // Search options
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [showOptions, setShowOptions] = useState(false)

  // Document management
  const [showFileList, setShowFileList] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<UnifiedDocument | null>(null)
  const [previewPageNumber, setPreviewPageNumber] = useState<number | "all">("all")
  const [previewFilterText, setPreviewFilterText] = useState<string>("")
  const [previewTargetLine, setPreviewTargetLine] = useState<number | null>(null)
  const [previewCopied, setPreviewCopied] = useState<boolean>(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const openDocPreview = (match: SearchMatchItem) => {
    const foundDoc = documents.find(
      (d) => d.id === match.documentId || d.name === match.documentName
    )
    if (foundDoc) {
      setPreviewDoc(foundDoc)
      setPreviewFilterText(searchQuery)
      setPreviewTargetLine(match.lineNumber || null)
      if (match.pageOrSection) {
        const pageMatch = match.pageOrSection.match(/Page\s+(\d+)/i)
        if (pageMatch) {
          setPreviewPageNumber(parseInt(pageMatch[1], 10))
        } else {
          setPreviewPageNumber("all")
        }
      } else {
        setPreviewPageNumber("all")
      }
    }
  }

  const handleCopyPreviewContent = (text: string) => {
    navigator.clipboard.writeText(text)
    setPreviewCopied(true)
    setTimeout(() => setPreviewCopied(false), 2000)
  }

  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  // Debounce search query (150ms) to ensure smooth 60 FPS typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setVisibleCount(MATCHES_PER_PAGE)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Non-blocking concurrent file processing
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setIsProcessing(true)
    setProcessingStatus(`Initializing parser for ${files.length} file${files.length === 1 ? "" : "s"}…`)

    try {
      const parsedDocs = await UnifiedDocumentParser.parseFilesConcurrentPool(
        files,
        (processed, total, currentName) => {
          setProcessingStatus(`Parsing (${processed}/${total}): ${currentName}`)
        },
        3 // 3 concurrent workers
      )

      setDocuments((prev) => {
        const existingIds = new Set(prev.map((d) => d.id))
        const newUnique = parsedDocs.filter((d) => !existingIds.has(d.id))
        return [...prev, ...newUnique]
      })
    } catch (err) {
      console.error("Batch processing error:", err)
    } finally {
      setIsProcessing(false)
      setProcessingStatus("")
    }
  }, [])

  // Window-wide drag & drop listener (catches drops ANYWHERE on the page)
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current += 1
      if (e.dataTransfer?.types?.includes("Files")) {
        setIsGlobalDragging(true)
      }
    }

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current -= 1
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        setIsGlobalDragging(false)
      }
    }

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault()
    }

    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsGlobalDragging(false)

      const items = e.dataTransfer?.items
      const fileList: File[] = []

      if (items && items.length > 0) {
        const traverseEntry = async (entry: any): Promise<void> => {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve) => entry.file(resolve))
            fileList.push(file)
          } else if (entry.isDirectory) {
            const reader = entry.createReader()
            const entries = await new Promise<any[]>((resolve) => reader.readEntries(resolve))
            for (const child of entries) {
              await traverseEntry(child)
            }
          }
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
          if (entry) {
            await traverseEntry(entry)
          } else if (item.kind === "file") {
            const file = item.getAsFile()
            if (file) fileList.push(file)
          }
        }
      } else if (e.dataTransfer?.files) {
        fileList.push(...Array.from(e.dataTransfer.files))
      }

      if (fileList.length > 0) {
        await processFiles(fileList)
      }
    }

    window.addEventListener("dragenter", handleWindowDragEnter)
    window.addEventListener("dragleave", handleWindowDragLeave)
    window.addEventListener("dragover", handleWindowDragOver)
    window.addEventListener("drop", handleWindowDrop)

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter)
      window.removeEventListener("dragleave", handleWindowDragLeave)
      window.removeEventListener("dragover", handleWindowDragOver)
      window.removeEventListener("drop", handleWindowDrop)
    }
  }, [processFiles])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      void processFiles(files)
      e.target.value = ""
    }
  }

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id))
    if (previewDoc?.id === id) setPreviewDoc(null)
  }

  const clearAllDocuments = () => {
    setDocuments([])
    setPreviewDoc(null)
    setSearchQuery("")
  }

  const totalSize = useMemo(() => {
    return documents.reduce((sum, d) => sum + d.size, 0)
  }, [documents])

  // Search Results
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim() || documents.length === 0) return []
    const options: SearchFilterOptions = {
      caseSensitive,
      wholeWord,
      useRegex,
      selectedTypes: typeFilter === "all" ? undefined : [typeFilter],
    }
    return searchUnifiedDocuments(documents, debouncedQuery, options)
  }, [documents, debouncedQuery, caseSensitive, wholeWord, useRegex, typeFilter])

  const paginatedResults = useMemo(() => {
    return searchResults.slice(0, visibleCount)
  }, [searchResults, visibleCount])

  const getRagDocuments = useCallback(async (): Promise<RagDocumentInput[]> => {
    return documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      path: doc.path,
      content: doc.content,
    }))
  }, [documents])

  const copySnippet = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Hidden file & folder inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* FULL-PAGE GLOBAL DROPZONE OVERLAY (Triggered anywhere on screen) */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center p-6 border-4 border-dashed border-purple-500 animate-in fade-in-50 duration-150 pointer-events-none">
          <div className="p-8 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 mb-6 ring-8 ring-purple-500/10 animate-bounce">
            <UploadCloud className="h-20 w-20" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3 text-center">
            Drop Anywhere to Upload
          </h2>
          <p className="text-base text-muted-foreground max-w-lg text-center leading-relaxed">
            Release your files or folder anywhere on the screen to parse and index them instantly.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {["PDF", "Word (.docx)", "Excel (.xlsx)", "PowerPoint (.pptx)", "Code", "Text"].map((t) => (
              <Badge key={t} variant="secondary" className="text-xs px-3 py-1 font-medium">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Main Search Input Bar */}
      <div className="relative rounded-2xl border border-border/80 bg-card hover:border-border transition-all duration-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 sm:p-3">
          {/* Search Input Box */}
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                documents.length > 0
                  ? `Search across ${documents.length} loaded document${documents.length === 1 ? "" : "s"}…`
                  : "Search inside documents or drop files below…"
              }
              className="w-full h-12 pl-12 pr-10 bg-transparent text-sm sm:text-base placeholder:text-muted-foreground/70 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Action Upload Buttons */}
          <div className="flex items-center gap-2 justify-end px-1 sm:px-0">
            <Button
              variant="outline"
              size="default"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-4 text-xs sm:text-sm font-medium rounded-xl"
            >
              <Upload className="h-4 w-4 mr-2" />
              Browse Files
            </Button>
            <Button
              variant="default"
              size="default"
              disabled={isProcessing}
              onClick={() => folderInputRef.current?.click()}
              className="h-10 px-4 text-xs sm:text-sm font-medium rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-500/20"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Select Folder
            </Button>
          </div>
        </div>

        {/* Processing Progress Bar */}
        {isProcessing && (
          <div className="px-5 py-2.5 bg-purple-500/5 border-t border-purple-500/20 flex items-center gap-2.5 text-xs sm:text-sm text-purple-600 dark:text-purple-400 font-medium">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>{processingStatus}</span>
          </div>
        )}
      </div>

      {/* WIDER & LARGER DROPBOX (When no documents loaded) */}
      {documents.length === 0 && !isProcessing && (
        <div
          className="relative text-center py-16 sm:py-24 px-6 sm:px-12 border-2 border-dashed border-border/80 hover:border-purple-500/60 rounded-3xl bg-gradient-to-b from-card/60 via-card/30 to-card/60 hover:bg-purple-500/[0.02] transition-all duration-300 cursor-pointer shadow-sm group"
          onClick={() => folderInputRef.current?.click()}
        >
          <div className="max-w-2xl mx-auto flex flex-col items-center justify-center">
            {/* Big Prominent Icon */}
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6 ring-8 ring-purple-500/5 group-hover:scale-105 group-hover:ring-purple-500/10 transition-all duration-300">
              <FolderOpen className="h-10 w-10 sm:h-12 sm:w-12" />
            </div>

            {/* Large Welcoming Title */}
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              Drag & Drop Any Files or Folder Here
            </h3>

            {/* Subtitle description */}
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mb-8 leading-relaxed">
              Drop entire directories or single files. We automatically extract and index text from PDFs, Word documents, Excel sheets, PowerPoint decks, code, and notes.
            </p>

            {/* Large Interactive Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8" onClick={(e) => e.stopPropagation()}>
              <Button
                size="lg"
                className="h-12 px-6 text-sm sm:text-base font-semibold rounded-2xl bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/25 transition-transform active:scale-95"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="h-5 w-5 mr-2.5" />
                Select Entire Folder
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 text-sm sm:text-base font-semibold rounded-2xl border-border/80 hover:bg-muted transition-transform active:scale-95"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 mr-2.5" />
                Browse Multiple Files
              </Button>
            </div>

            {/* Quick format tags pill row inside the drop box */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-4 border-t border-border/40 w-full text-xs text-muted-foreground">
              <span className="font-medium mr-1">Fast multi-format support:</span>
              <Badge variant="outline" className="text-[11px] bg-background/80">📄 PDF (with OCR)</Badge>
              <Badge variant="outline" className="text-[11px] bg-background/80">📝 Word (.docx, .doc)</Badge>
              <Badge variant="outline" className="text-[11px] bg-background/80">📊 Excel (.xlsx, .csv)</Badge>
              <Badge variant="outline" className="text-[11px] bg-background/80">📈 PowerPoint (.pptx)</Badge>
              <Badge variant="outline" className="text-[11px] bg-background/80">💻 Code & Text</Badge>
            </div>
          </div>
        </div>
      )}

      {/* Loaded Files Bar & Controls */}
      {documents.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            {/* File status tag */}
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="font-semibold flex items-center gap-1.5 text-foreground">
                <Check className="h-4 w-4 text-green-500" />
                {documents.length} file{documents.length === 1 ? "" : "s"} loaded
              </span>
              <span className="text-muted-foreground font-mono">({formatFileSize(totalSize)})</span>
              <button
                onClick={() => setShowFileList(!showFileList)}
                className="text-purple-600 dark:text-purple-400 hover:underline font-medium ml-1"
              >
                {showFileList ? "Hide list" : "View files"}
              </button>
            </div>

            {/* Mode & Filters Toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-2.5 text-xs ${showOptions ? "text-purple-600 bg-purple-50 dark:bg-purple-950/40" : "text-muted-foreground"}`}
                onClick={() => setShowOptions(!showOptions)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                Search Options
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearAllDocuments}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear All
              </Button>
            </div>
          </div>

          {/* Collapsible Options Drawer */}
          {showOptions && (
            <div className="p-4 rounded-2xl border border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-4 text-xs animate-in fade-in-50">
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Switch checked={caseSensitive} onCheckedChange={setCaseSensitive} className="scale-75" />
                  <span>Case Sensitive</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Switch checked={wholeWord} onCheckedChange={setWholeWord} className="scale-75" />
                  <span>Whole Word</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Switch checked={useRegex} onCheckedChange={setUseRegex} className="scale-75" />
                  <span>Regex</span>
                </label>
              </div>

              {/* Type Filters */}
              <div className="flex items-center gap-1.5">
                {["all", "pdf", "word", "spreadsheet", "presentation", "code", "text"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`capitalize px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      typeFilter === t
                        ? "bg-purple-600 text-white"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible File List Drawer */}
          {showFileList && (
            <div className="p-4 rounded-2xl border border-border/60 bg-card/60 max-h-60 overflow-y-auto space-y-1.5 text-xs animate-in fade-in-50">
              {documents.map((doc) => {
                const Icon = getIconForType(doc.type)
                const style = getBadgeStyleForType(doc.type)
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-background transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${style}`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {doc.extension.toUpperCase()}
                      </Badge>
                      <span className="font-medium truncate text-sm">{doc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatFileSize(doc.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDocument(doc.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Simple Tab Switcher: Search / AI */}
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "search" | "ai")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-sm mx-auto mb-6 h-11 p-1 bg-muted/70 rounded-2xl">
              <TabsTrigger value="search" className="text-xs sm:text-sm font-medium rounded-xl">
                <Search className="h-4 w-4 mr-2" />
                Search Content
              </TabsTrigger>
              <TabsTrigger value="ai" className="text-xs sm:text-sm font-medium rounded-xl">
                <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                AI Assistant
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: INSTANT KEYWORD SEARCH */}
            <TabsContent value="search" className="space-y-4">
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-xs sm:text-sm text-muted-foreground font-medium px-1 flex items-center justify-between">
                      <span>
                        Found {searchResults.length} match{searchResults.length === 1 ? "" : "es"} across{" "}
                        {new Set(searchResults.map((r) => r.documentId)).size} file
                        {new Set(searchResults.map((r) => r.documentId)).size === 1 ? "" : "s"}
                      </span>
                      {searchResults.length > MATCHES_PER_PAGE && (
                        <span>
                          Showing {Math.min(visibleCount, searchResults.length)} of {searchResults.length}
                        </span>
                      )}
                    </div>

                    {paginatedResults.map((match) => {
                      const Icon = getIconForType(match.documentType)
                      const style = getBadgeStyleForType(match.documentType)

                      return (
                        <Card
                          key={match.id}
                          onClick={() => openDocPreview(match)}
                          className="border border-border/70 bg-card/80 hover:border-purple-500/60 hover:shadow-lg transition-all rounded-2xl cursor-pointer group"
                        >
                          <CardContent className="p-4 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 border ${style}`}>
                                  <Icon className="h-3 w-3 mr-1" />
                                  {match.extension.toUpperCase()}
                                </Badge>
                                <span className="font-semibold text-sm truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                  {match.documentName}
                                </span>
                                {match.pageOrSection && (
                                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                                    {match.pageOrSection}
                                  </Badge>
                                )}
                                {match.lineNumber && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    Line {match.lineNumber}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium hidden sm:inline-flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                  <Eye className="h-3.5 w-3.5" /> View File
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                                  onClick={() => copySnippet(match.id, match.fullSnippet)}
                                >
                                  {copiedId === match.id ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 mr-1 text-green-500" /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>

                            {/* Snippet */}
                            <div className="p-3 rounded-xl bg-muted/60 font-mono text-xs sm:text-sm text-foreground/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                              <span>{match.beforeContext}</span>
                              <mark className="bg-yellow-300/60 dark:bg-yellow-500/40 text-foreground font-semibold px-1 rounded">
                                {match.matchText}
                              </mark>
                              <span>{match.afterContext}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}

                    {/* Pagination / Load More Button for large match sets */}
                    {visibleCount < searchResults.length && (
                      <div className="pt-2 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVisibleCount((prev) => prev + MATCHES_PER_PAGE)}
                          className="text-xs font-medium rounded-xl border-border/80"
                        >
                          <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
                          Load {Math.min(MATCHES_PER_PAGE, searchResults.length - visibleCount)} More Matches ({searchResults.length - visibleCount} remaining)
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No matches found for "{searchQuery}". Try relaxing search filters.
                  </div>
                )
              ) : (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  Type a keyword in the search bar above to instantly find matches in all loaded files.
                </div>
              )}
            </TabsContent>

            {/* TAB 2: AI ASSISTANT */}
            <TabsContent value="ai">
              <div className="min-h-[520px]">
                <AISearchChat getDocuments={getRagDocuments} hasDocuments={documents.length > 0} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Document Quick Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in-50"
          onClick={() => setPreviewDoc(null)}
        >
          <Card
            className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-background border shadow-2xl rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-col gap-3 p-4 sm:p-5 border-b bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Badge variant="outline" className={`text-xs ${getBadgeStyleForType(previewDoc.type)} px-2 py-0.5`}>
                    {previewDoc.extension.toUpperCase()}
                  </Badge>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base sm:text-lg truncate text-foreground flex items-center gap-2">
                      {previewDoc.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{previewDoc.path}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs rounded-xl h-8"
                    onClick={() => handleCopyPreviewContent(previewDoc.content)}
                  >
                    {previewCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1 text-green-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy Text
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewDoc(null)}
                    className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Stats & Search Inside File Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                  <span>{previewDoc.wordCount.toLocaleString()} words</span>
                  <span>•</span>
                  <span>{previewDoc.lineCount.toLocaleString()} lines</span>
                  <span>•</span>
                  <span>{formatFileSize(previewDoc.size)}</span>
                  {previewDoc.pages && (
                    <>
                      <span>•</span>
                      <span>{previewDoc.pages.length} page{previewDoc.pages.length === 1 ? "" : "s"}</span>
                    </>
                  )}
                </div>

                {/* Filter / Highlight input inside preview */}
                <div className="relative flex items-center min-w-[200px] max-w-xs flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Highlight word in file…"
                    value={previewFilterText}
                    onChange={(e) => setPreviewFilterText(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 text-xs bg-background border rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  {previewFilterText && (
                    <button
                      onClick={() => setPreviewFilterText("")}
                      className="absolute right-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Page / Sheet Selector (if multi-page) */}
              {previewDoc.pages && previewDoc.pages.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
                  <button
                    onClick={() => setPreviewPageNumber("all")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                      previewPageNumber === "all"
                        ? "bg-purple-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    All Pages
                  </button>
                  {previewDoc.pages.map((p) => (
                    <button
                      key={p.pageNumber}
                      onClick={() => setPreviewPageNumber(p.pageNumber)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                        previewPageNumber === p.pageNumber
                          ? "bg-purple-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {p.title || `Page ${p.pageNumber}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Body Content */}
            <CardContent className="flex-1 overflow-y-auto p-0 bg-card font-mono text-xs sm:text-sm">
              {(() => {
                let textToDisplay = previewDoc.content
                if (previewDoc.pages && previewPageNumber !== "all") {
                  const targetPage = previewDoc.pages.find((p) => p.pageNumber === previewPageNumber)
                  textToDisplay = targetPage ? targetPage.content : previewDoc.content
                }

                if (!textToDisplay || !textToDisplay.trim()) {
                  return <div className="text-center py-12 text-muted-foreground text-sm font-sans">No readable text content.</div>
                }

                const lines = textToDisplay.split("\n")
                const filter = previewFilterText.trim()
                const filterRegex = filter ? new RegExp(`(${filter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi") : null

                return (
                  <div className="divide-y divide-border/20 py-2 select-text">
                    {lines.map((line, idx) => {
                      const lineNum = idx + 1
                      const isTargetLine = previewTargetLine === lineNum
                      const escapedLine = line
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")

                      const highlightedLine = filterRegex
                        ? escapedLine.replace(
                            filterRegex,
                            '<mark class="bg-yellow-300 dark:bg-yellow-500/50 text-foreground font-semibold px-1 rounded">$1</mark>'
                          )
                        : escapedLine

                      return (
                        <div
                          key={idx}
                          id={`preview-line-${lineNum}`}
                          className={`flex items-start gap-3 px-4 py-1 hover:bg-muted/40 transition-colors ${
                            isTargetLine
                              ? "bg-purple-500/15 dark:bg-purple-950/40 border-l-4 border-purple-500 font-medium"
                              : ""
                          }`}
                        >
                          <span
                            className={`w-10 text-right shrink-0 select-none text-[11px] pt-0.5 ${
                              isTargetLine
                                ? "text-purple-600 dark:text-purple-400 font-bold"
                                : "text-muted-foreground/60"
                            }`}
                          >
                            {lineNum}
                          </span>
                          <div
                            dangerouslySetInnerHTML={{ __html: highlightedLine || "&nbsp;" }}
                            className="flex-1 whitespace-pre-wrap leading-relaxed break-words text-foreground/90"
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
