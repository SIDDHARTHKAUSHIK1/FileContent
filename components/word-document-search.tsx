"use client"

import type React from "react"
import { useState, useCallback, useMemo } from "react"
import { ArrowLeft, Upload, FileText, Zap, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DocumentParser, type DocumentLayout, type SearchMatch } from "@/lib/document-parser"
import DocumentViewer from "@/components/document-viewer"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import AISearchChat from "@/components/ai-search-chat"

interface WordDocumentSearchProps {
  onBack: () => void
}

export default function WordDocumentSearch({ onBack }: WordDocumentSearchProps) {
  const [documentLayouts, setDocumentLayouts] = useState<Array<{ fileName: string; layout: DocumentLayout }>>([])
  const [searchResults, setSearchResults] = useState<
    Array<{ fileName: string; matches: SearchMatch[]; layout: DocumentLayout }>
  >([])
  const [currentMatch, setCurrentMatch] = useState<SearchMatch | null>(null)
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supportedTypes = [".docx", ".doc"]

  const handleFileUpload = useCallback(async (file: File) => {
    setIsProcessing(true)
    setError(null)

    // File type validation
    if (!supportedTypes.some(type => file.name.toLowerCase().endsWith(type))) {
      setError("Unsupported File Format")
      setIsProcessing(false)
      return
    }

    try {
      console.log(`Processing document: ${file.name}`)
      const layout = await DocumentParser.parseDocument(file)

      setDocumentLayouts((prev) => [...prev, { fileName: file.name, layout }])
      setCurrentMatch(null)
      setSelectedFileIndex((prev) => (prev === null ? 0 : prev))
    } catch (error: any) {
      console.error("Error processing document:", error)
      setError(`Failed to process document: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      const validFiles = files.filter((file) => {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase()
        return supportedTypes.includes(fileExt)
      })

      if (validFiles.length === 0) {
        setError("Unsupported File Format")
        return
      }

      validFiles.forEach((file) => {
        handleFileUpload(file)
      })
    },
    [handleFileUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      const validFiles = Array.from(files).filter((file) => {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase()
        return supportedTypes.includes(fileExt)
      })

      if (validFiles.length === 0) {
        setError("Unsupported File Format")
        return
      }

      validFiles.forEach((file) => {
        handleFileUpload(file)
      })
    },
    [handleFileUpload],
  )

  const [searchQuery, setSearchQuery] = useState("")

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setCurrentMatch(null)
      setSelectedFileIndex(null)
      return
    }

    const results = documentLayouts
      .map(({ fileName, layout }) => {
        const matches = DocumentParser.searchDocument(layout, searchQuery, {
          matchCase: false,
          wholeWord: false,
          useWildcards: false,
          useRegex: false,
          searchBackwards: false,
        })
        return { fileName, matches, layout }
      })
      .filter(({ matches }) => matches.length > 0)

    setSearchResults(results)
    setSelectedFileIndex(results.length > 0 ? 0 : null)
    setCurrentMatch(results.length > 0 ? results[0].matches[0] : null)
  }, [documentLayouts, searchQuery])

  const handleFileChange = useCallback(
    (index: number) => {
      setSelectedFileIndex(index)
      setCurrentMatch(searchResults[index].matches[0])
    },
    [searchResults],
  )

  const ragDocuments = useMemo(
    () =>
      documentLayouts.map(({ fileName, layout }, index) => ({
        id: `${fileName}-${index}`,
        name: fileName,
        content: layout.text,
      })),
    [documentLayouts],
  )

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-7xl">
        <Tabs defaultValue="search">
          <TabsList className="mb-4">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI Search
            </TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <div>
                  <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <Zap className="h-8 w-8 text-yellow-500" />
                    Word Document Search
                  </h1>
                  <p className="text-muted-foreground">
                    Advanced Microsoft Word-like search with accurate page detection and document structure analysis.
                  </p>
                </div>
              </div>
            </div>

            {/* File Upload */}
            {documentLayouts.length === 0 && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      accept=".doc,.docx"
                      onChange={handleFileSelect}
                      className="hidden"
                      multiple
                      // @ts-ignore
                      webkitdirectory="true"
                      // @ts-ignore
                      directory="true"
                    />

                    <div className="space-y-3">
                      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        {isProcessing ? (
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>

                      <div>
                        <p className="font-medium mb-1">
                          {isProcessing ? "Processing document(s)..." : "Upload documents or folders to search"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Supports .doc and .docx files. Drag and drop or click to browse folders.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error Alert */}
            {error && (
              <div className="text-red-600 font-bold text-center mb-4">{error}</div>
            )}

            {/* Search Input */}
            {documentLayouts.length > 0 && (
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="Enter search keywords"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full p-2 border border-gray-300 rounded"
                />
                <Button onClick={handleSearch} className="mt-2">
                  Search All Documents
                </Button>
              </div>
            )}

            {/* Main Interface */}
            {searchResults.length > 0 && selectedFileIndex !== null && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* File List */}
                <div className="space-y-2">
                  {searchResults.map(({ fileName }, index) => (
                    <Button
                      key={fileName}
                      variant={index === selectedFileIndex ? "default" : "outline"}
                      onClick={() => handleFileChange(index)}
                      className="w-full text-ellipsis overflow-hidden whitespace-nowrap"
                    >
                      {fileName}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDocumentLayouts([])
                      setSearchResults([])
                      setCurrentMatch(null)
                      setSelectedFileIndex(null)
                      setError(null)
                      setSearchQuery("")
                    }}
                    className="w-full mt-4"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Load Different Document(s)
                  </Button>
                </div>

                {/* Document Viewer */}
                <div className="lg:col-span-2 space-y-4">
                  <DocumentViewer
                    documentLayout={searchResults[selectedFileIndex].layout}
                    currentMatch={currentMatch}
                    fileName={searchResults[selectedFileIndex].fileName}
                  />
                </div>
              </div>
            )}

            {/* No results message */}
            {searchResults.length === 0 && documentLayouts.length > 0 && (
              <div className="text-center text-muted-foreground mt-8">
                No files contain the searched keywords.
              </div>
            )}
          </TabsContent>
          <TabsContent value="ai">
            <div className="h-[calc(100vh-180px)]">
              <AISearchChat documents={ragDocuments} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
