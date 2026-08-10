"use client"

import React, { useState, useCallback, useRef, useMemo } from "react"
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
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  Trash2,
  FileCode,
  FileSpreadsheet,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  UnifiedDocumentParser,
  searchUnifiedDocuments,
  SUPPORTED_EXTENSIONS_MAP,
  getFileExtension,
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
      return FileText
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
  
  // Search Options
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  
  // File explorer toggle
  const [showFileList, setShowFileList] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<UnifiedDocument | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Process incoming files
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setIsProcessing(true)
    setProcessingStatus(`Parsing 0 / ${files.length} files…`)

    const parsedDocs: UnifiedDocument[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProcessingStatus(`Processing (${i + 1}/${files.length}): ${file.name}`)
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

  // Drag and Drop handlers
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
      // Helper to traverse directories
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
    setHasSearched(false)
  }

  // Type Breakdown Calculation
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    documents.forEach((d) => {
      counts[d.type] = (counts[d.type] || 0) + 1
    })
    return counts
  }, [documents])

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setHasSearched(true)
  }

  // Format documents for AI RAG assistant
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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
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

      {/* Main Upload / Dropzone Card */}
      {documents.length === 0 ? (
        <Card
          className={`border-2 border-dashed transition-all duration-300 ${
            isDragging
              ? "border-purple-500 bg-purple-500/10 scale-[1.01]"
              : "border-border hover:border-purple-500/50 bg-card/60"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <CardContent className="p-8 sm:p-12 text-center flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 ring-8 ring-purple-500/5">
              {isProcessing ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <FolderOpen className="h-8 w-8" />
              )}
            </div>

            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
              {isProcessing ? "Processing Your Files…" : "Drop Any Folder or Files Here"}
            </h3>

            <p className="text-muted-foreground text-sm max-w-lg mb-6 leading-relaxed">
              {isProcessing
                ? processingStatus
                : "Drag & drop any folder, PDF, Word doc, Excel sheet, PowerPoint presentation, code repository, or text files to instantly search content & chat with AI."}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                disabled={isProcessing}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Select Entire Folder
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Browse Multiple Files
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Loaded Collection Bar */
        <Card className="border border-border/80 bg-card/90 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">
                      {documents.length} File{documents.length === 1 ? "" : "s"} Ready for Search
                    </h3>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {formatFileSize(totalSize)}
                    </Badge>
                  </div>
                  {/* File Type Breakdown Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {Object.entries(typeBreakdown).map(([type, count]) => {
                      const Icon = getIconForType(type as UnifiedDocument["type"])
                      const style = getBadgeStyleForType(type as UnifiedDocument["type"])
                      return (
                        <Badge
                          key={type}
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 border ${style} flex items-center gap-1 capitalize font-medium`}
                        >
                          <Icon className="h-3 w-3" />
                          {count} {type}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Add Files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => folderInputRef.current?.click()}
                  className="text-xs"
                >
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Add Folder
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={clearAllDocuments}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowFileList(!showFileList)}
                >
                  {showFileList ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Collapsible File Explorer Drawer */}
            {showFileList && (
              <div className="mt-4 pt-3 border-t border-border/50 max-h-60 overflow-y-auto space-y-1.5">
                {documents.map((doc) => {
                  const Icon = getIconForType(doc.type)
                  const style = getBadgeStyleForType(doc.type)
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-3 p-2 rounded-lg bg-background/60 hover:bg-background border border-border/40 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${style}`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {doc.extension.toUpperCase()}
                        </Badge>
                        <span className="font-medium truncate" title={doc.name}>
                          {doc.name}
                        </span>
                        <span className="text-muted-foreground text-[11px] truncate hidden md:inline">
                          {doc.path}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {formatFileSize(doc.size)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
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
          </CardContent>
        </Card>
      )}

      {/* Main Mode Tabs: Content Search & AI Assistant */}
      {documents.length > 0 && (
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "search" | "ai")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto mb-6 h-11 p-1 bg-muted/80">
            <TabsTrigger value="search" className="flex items-center gap-2 text-xs sm:text-sm font-medium">
              <Search className="h-4 w-4" />
              <span>Instant Content Search</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2 text-xs sm:text-sm font-medium">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span>AI Document Assistant</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: INSTANT KEYWORD & REGEX CONTENT SEARCH */}
          <TabsContent value="search" className="space-y-6">
            <Card className="border border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Search Inside Uploaded Documents</span>
                  {searchQuery && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {searchResults.length} match{searchResults.length === 1 ? "" : "es"} found
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setHasSearched(true)
                      }}
                      placeholder="Search text, code, keywords, phrases, or regex across all loaded documents…"
                      className="pl-9 pr-8"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </form>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40 text-xs">
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
                      <span>Regular Expression</span>
                    </label>
                  </div>

                  {/* Filter by Type Selector */}
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Type:</span>
                    {["all", "pdf", "word", "spreadsheet", "presentation", "code", "text"].map((type) => (
                      <button
                        key={type}
                        onClick={() => setTypeFilter(type)}
                        className={`capitalize px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          typeFilter === type
                            ? "bg-purple-600 text-white"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search Results Display */}
            {searchQuery.trim() ? (
              searchResults.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground font-medium flex items-center justify-between px-1">
                    <span>
                      Found {searchResults.length} occurrence{searchResults.length === 1 ? "" : "s"} across{" "}
                      {new Set(searchResults.map((r) => r.documentId)).size} document
                      {new Set(searchResults.map((r) => r.documentId)).size === 1 ? "" : "s"}
                    </span>
                  </div>

                  {searchResults.map((match) => {
                    const Icon = getIconForType(match.documentType)
                    const badgeStyle = getBadgeStyleForType(match.documentType)

                    return (
                      <Card key={match.id} className="border border-border/70 hover:border-purple-500/40 transition-all bg-card/70">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${badgeStyle}`}>
                                <Icon className="h-3 w-3 mr-1" />
                                {match.extension.toUpperCase()}
                              </Badge>
                              <span className="font-semibold text-sm truncate" title={match.documentName}>
                                {match.documentName}
                              </span>
                              {match.pageOrSection && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                                  {match.pageOrSection}
                                </Badge>
                              )}
                              {match.lineNumber && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  Line {match.lineNumber}
                                </span>
                              )}
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
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

                          {/* Highlighted Snippet */}
                          <div className="p-2.5 rounded-md bg-muted/60 font-mono text-xs text-foreground/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                            <span>{match.beforeContext}</span>
                            <mark className="bg-yellow-300/40 dark:bg-yellow-500/30 text-foreground font-bold px-1 rounded">
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
                <div className="py-12 text-center text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-base">No matches found for "{searchQuery}"</p>
                  <p className="text-xs mt-1">Try relaxing case sensitivity, disabling regex, or changing the type filter.</p>
                </div>
              )
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-base">Type a search query above to search inside all {documents.length} files</p>
                <p className="text-xs mt-1">Supports instant multi-file keyword search, page and slide tracking, and regex.</p>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: AI DOCUMENT ASSISTANT (RAG GROUNDED Q&A) */}
          <TabsContent value="ai">
            <div className="min-h-[560px]">
              <AISearchChat
                getDocuments={getRagDocuments}
                hasDocuments={documents.length > 0}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Document Quick Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-background border shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={`text-xs ${getBadgeStyleForType(previewDoc.type)}`}>
                  {previewDoc.extension.toUpperCase()}
                </Badge>
                <CardTitle className="text-base truncate">{previewDoc.name}</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(null)} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/90">
                {previewDoc.content || "[No text content could be previewed]"}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
