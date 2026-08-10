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
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  SlidersHorizontal,
} from "lucide-react"
import { Input } from "@/components/ui/input"
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
  const [isDragging, setIsDragging] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
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
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Process incoming files
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setIsProcessing(true)
    setProcessingStatus(`Parsing ${files.length} file${files.length === 1 ? "" : "s"}…`)

    const parsedDocs: UnifiedDocument[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProcessingStatus(`Parsing (${i + 1}/${files.length}): ${file.name}`)
      try {
        const doc = await UnifiedDocumentParser.parseFile(file)
        parsedDocs.push(doc)
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err)
      }
    }

    setDocuments((prev) => {
      const existingIds = new Set(prev.map((d) => d.id))
      const newUnique = parsedDocs.filter((d) => !existingIds.has(d.id))
      return [...prev, ...newUnique]
    })

    setIsProcessing(false)
    setProcessingStatus("")
  }, [])

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const items = e.dataTransfer.items
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
    } else if (e.dataTransfer.files) {
      fileList.push(...Array.from(e.dataTransfer.files))
    }

    if (fileList.length > 0) {
      await processFiles(fileList)
    }
  }

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
    if (!searchQuery.trim() || documents.length === 0) return []
    const options: SearchFilterOptions = {
      caseSensitive,
      wholeWord,
      useRegex,
      selectedTypes: typeFilter === "all" ? undefined : [typeFilter],
    }
    return searchUnifiedDocuments(documents, searchQuery, options)
  }, [documents, searchQuery, caseSensitive, wholeWord, useRegex, typeFilter])

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
    <div className="space-y-5">
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

      {/* Main Clean Search & Drop Bar */}
      <div
        className={`relative rounded-2xl border transition-all duration-200 shadow-sm ${
          isDragging
            ? "border-purple-500 ring-4 ring-purple-500/10 bg-purple-50/50 dark:bg-purple-950/20"
            : "border-border/80 bg-card hover:border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 sm:p-2.5">
          {/* Search Input Box */}
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                documents.length > 0
                  ? `Search across ${documents.length} loaded document${documents.length === 1 ? "" : "s"}…`
                  : "Drop files here or search keywords after uploading…"
              }
              className="w-full h-11 pl-10 pr-9 bg-transparent text-sm placeholder:text-muted-foreground/70 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Action Upload Buttons */}
          <div className="flex items-center gap-1.5 justify-end px-1 sm:px-0">
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 text-xs rounded-xl"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Files
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isProcessing}
              onClick={() => folderInputRef.current?.click()}
              className="h-9 text-xs rounded-xl bg-purple-600 hover:bg-purple-700 text-white"
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Folder
            </Button>
          </div>
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="px-4 py-2 bg-purple-500/5 border-t border-purple-500/20 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{processingStatus}</span>
          </div>
        )}
      </div>

      {/* Drag Over Notification Overlay */}
      {isDragging && (
        <div className="text-center py-4 rounded-xl border border-dashed border-purple-500 bg-purple-500/5 text-purple-600 dark:text-purple-400 text-xs font-medium animate-in fade-in-50">
          Drop your files or folder to start instant processing
        </div>
      )}

      {/* When Empty: Simple Clean Drop Hint */}
      {documents.length === 0 && !isProcessing && !isDragging && (
        <div className="text-center py-10 px-4 border border-dashed border-border/60 rounded-2xl bg-card/40">
          <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No documents loaded yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            Drag & drop any folder or click "Files" / "Folder" above to search across PDFs, Word, Excel, Slides, Code, and Text files.
          </p>
        </div>
      )}

      {/* Loaded Files Bar & Controls */}
      {documents.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            {/* File status tag */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-green-500" />
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
                className={`h-7 px-2 text-xs ${showOptions ? "text-purple-600 bg-purple-50 dark:bg-purple-950/40" : "text-muted-foreground"}`}
                onClick={() => setShowOptions(!showOptions)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                Options
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearAllDocuments}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {/* Collapsible Options Drawer */}
          {showOptions && (
            <div className="p-3 rounded-xl border border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in-50">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <Switch checked={caseSensitive} onCheckedChange={setCaseSensitive} className="scale-75" />
                  <span>Case Sensitive</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <Switch checked={wholeWord} onCheckedChange={setWholeWord} className="scale-75" />
                  <span>Whole Word</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <Switch checked={useRegex} onCheckedChange={setUseRegex} className="scale-75" />
                  <span>Regex</span>
                </label>
              </div>

              {/* Type Filters */}
              <div className="flex items-center gap-1">
                {["all", "pdf", "word", "spreadsheet", "presentation", "code", "text"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`capitalize px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
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
            <div className="p-3 rounded-xl border border-border/60 bg-card/60 max-h-52 overflow-y-auto space-y-1 text-xs animate-in fade-in-50">
              {documents.map((doc) => {
                const Icon = getIconForType(doc.type)
                const style = getBadgeStyleForType(doc.type)
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-background transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${style}`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {doc.extension.toUpperCase()}
                      </Badge>
                      <span className="font-medium truncate">{doc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {formatFileSize(doc.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDocument(doc.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Simple Tab Switcher: Search / AI */}
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "search" | "ai")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-xs mx-auto mb-4 h-10 p-1 bg-muted/70 rounded-xl">
              <TabsTrigger value="search" className="text-xs font-medium rounded-lg">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Search
              </TabsTrigger>
              <TabsTrigger value="ai" className="text-xs font-medium rounded-lg">
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-500" />
                AI Assistant
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: INSTANT KEYWORD SEARCH */}
            <TabsContent value="search" className="space-y-3">
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="text-xs text-muted-foreground font-medium px-1">
                      Found {searchResults.length} match{searchResults.length === 1 ? "" : "es"} across{" "}
                      {new Set(searchResults.map((r) => r.documentId)).size} file
                      {new Set(searchResults.map((r) => r.documentId)).size === 1 ? "" : "s"}
                    </div>

                    {searchResults.map((match) => {
                      const Icon = getIconForType(match.documentType)
                      const style = getBadgeStyleForType(match.documentType)

                      return (
                        <Card key={match.id} className="border border-border/70 bg-card/80 hover:border-purple-500/30 transition-all">
                          <CardContent className="p-3.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${style}`}>
                                  <Icon className="h-3 w-3 mr-1" />
                                  {match.extension.toUpperCase()}
                                </Badge>
                                <span className="font-semibold text-xs sm:text-sm truncate">{match.documentName}</span>
                                {match.pageOrSection && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {match.pageOrSection}
                                  </Badge>
                                )}
                                {match.lineNumber && (
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    Line {match.lineNumber}
                                  </span>
                                )}
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => copySnippet(match.id, match.fullSnippet)}
                              >
                                {copiedId === match.id ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1 text-green-500" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 mr-1" /> Copy
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Snippet */}
                            <div className="p-2.5 rounded-lg bg-muted/60 font-mono text-xs text-foreground/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                              <span>{match.beforeContext}</span>
                              <mark className="bg-yellow-300/40 dark:bg-yellow-500/30 text-foreground font-semibold px-0.5 rounded">
                                {match.matchText}
                              </mark>
                              <span>{match.afterContext}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-muted-foreground text-xs">
                    No matches found for "{searchQuery}". Try relaxing search filters.
                  </div>
                )
              ) : (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  Type a keyword in the search bar above to instantly find matches in all loaded files.
                </div>
              )}
            </TabsContent>

            {/* TAB 2: AI ASSISTANT */}
            <TabsContent value="ai">
              <div className="min-h-[500px]">
                <AISearchChat getDocuments={getRagDocuments} hasDocuments={documents.length > 0} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Document Quick Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-background border shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between p-3.5 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={`text-xs ${getBadgeStyleForType(previewDoc.type)}`}>
                  {previewDoc.extension.toUpperCase()}
                </Badge>
                <span className="font-semibold text-sm truncate">{previewDoc.name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(null)} className="h-7 w-7 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardContent className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/90">
                {previewDoc.content || "[No text content]"}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
