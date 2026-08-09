"use client"

import { useState } from "react"
import { Search, FileText, Code, Zap, ArrowRight, Sparkles, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import MultiFileSearch from "@/components/multi-file-search"
import WordDocumentSearch from "@/components/word-document-search"
import PPTXXLSXSearch from "@/components/pptx-xlsx-search"
import dynamic from "next/dynamic"
import { GlobalHeader, type ToolType } from "@/components/global-header"
import AISearchChat from "@/components/ai-search-chat"

const PdfSearch = dynamic(() => import("@/components/pdf-search"), { ssr: false })

export default function FileSearchTool() {
  const [selectedTool, setSelectedTool] = useState<ToolType>(null)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GlobalHeader currentTool={selectedTool} onSelectTool={setSelectedTool} onBackToHome={() => setSelectedTool(null)} />

      {selectedTool === "multi" && (
        <div className="flex-1">
          <MultiFileSearch onBack={() => setSelectedTool(null)} />
        </div>
      )}

      {selectedTool === "word" && (
        <div className="flex-1">
          <WordDocumentSearch onBack={() => setSelectedTool(null)} />
        </div>
      )}

      {selectedTool === "pptx" && (
        <div className="flex-1">
          <PPTXXLSXSearch onBack={() => setSelectedTool(null)} />
        </div>
      )}

      {selectedTool === "pdf" && (
        <div className="flex-1">
          <PdfSearch onBack={() => setSelectedTool(null)} />
        </div>
      )}

      {selectedTool === "ai" && (
        <div className="flex-1 container mx-auto px-4 py-6 max-w-5xl">
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg text-purple-600 dark:text-purple-400">
                  <Sparkles className="h-6 w-6 animate-pulse" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Universal AI Document Search</h1>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Ask questions across any documents (PDF, DOCX, PPTX, XLSX, Code, Text). Answers are strictly grounded with citations.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedTool(null)}>
              ← Back to Tools
            </Button>
          </div>

          <div className="h-[calc(100vh-220px)] min-h-[600px]">
            <AISearchChat />
          </div>
        </div>
      )}

      {selectedTool === null && (
        <main className="flex-1 container mx-auto max-w-7xl px-4 py-8 flex flex-col justify-center">
          {/* Hero Section */}
          <div className="text-center max-w-3xl mx-auto mb-10">
            <Badge variant="outline" className="mb-3 px-3 py-1 text-xs border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10">
              ⚡ Multi-Format Document Intelligence & RAG
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
              Content-Based File & AI Search
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg">
              Search inside text, code, Word, PowerPoint, Excel, and PDF files instantly, or use the centralized AI Assistant to query all your documents.
            </p>
          </div>

          {/* Spotlight Hero: Universal AI Search Banner Card */}
          <Card className="mb-8 border-purple-500/30 bg-gradient-to-br from-purple-500/5 via-background to-blue-500/5 shadow-md hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-600 text-white hover:bg-purple-700">
                    <Sparkles className="h-3 w-3 mr-1" /> Central AI Hub
                  </Badge>
                  <span className="text-xs text-muted-foreground">Powered by NVIDIA RAG</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Universal AI Document Assistant
                </h2>
                <p className="text-muted-foreground text-sm max-w-2xl">
                  Upload any mix of files or folders (.pdf, .docx, .pptx, .xlsx, .txt, code up to 500 MB) and ask questions in natural language with source-grounded answers.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {["All-in-One Upload", "Grounded Citations", "Streaming Answers", "Zero Hallucinations"].map((item) => (
                    <Badge key={item} variant="secondary" className="text-[11px] font-normal">
                      ✓ {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25 px-6"
                  onClick={() => setSelectedTool("ai")}
                >
                  <Sparkles className="h-5 w-5 mr-2 animate-pulse" />
                  Launch AI Search
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Section Divider */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold tracking-tight">Targeted Format Search Tools</h3>
            <p className="text-xs text-muted-foreground">Keyword & regex search tailored to specific file formats</p>
          </div>

          {/* 4 Search Tool Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Multi-File Search */}
            <Card
              className="hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col group border hover:border-blue-500/40"
              onClick={() => setSelectedTool("multi")}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                    <Search className="h-5 w-5" />
                  </div>
                  Multi-File Search
                </CardTitle>
                <CardDescription className="text-xs">Code & text directory search</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-0">
                <div>
                  <p className="text-muted-foreground text-xs mb-3">
                    Fast scanning across Python, Java, JS, TS, HTML, JSON, CSV and markdown.
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {["Python", "Java", "JS/TS", "HTML", "JSON", "CSV"].map((type) => (
                      <Badge key={type} className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" variant="outline">
                        {type}
                      </Badge>
                    ))}
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Line number detection</li>
                    <li>• Case-sensitive & regex options</li>
                    <li>• File extension filters</li>
                  </ul>
                </div>
                <Button variant="outline" className="w-full mt-4 group-hover:bg-blue-600 group-hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setSelectedTool("multi") }}>
                  <Code className="h-4 w-4 mr-2" />
                  Open Multi-File
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Word Document Search */}
            <Card
              className="hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col group border hover:border-yellow-500/40"
              onClick={() => setSelectedTool("word")}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2.5 bg-yellow-100 dark:bg-yellow-900/50 rounded-xl text-yellow-600 dark:text-yellow-400 group-hover:scale-105 transition-transform">
                    <Zap className="h-5 w-5" />
                  </div>
                  Word Search
                </CardTitle>
                <CardDescription className="text-xs">DOCX & DOC document analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-0">
                <div>
                  <p className="text-muted-foreground text-xs mb-3">
                    Accurate page calculation, section & heading recognition with previewer.
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {[".docx", ".doc"].map((type) => (
                      <Badge key={type} className="text-[10px] bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" variant="outline">
                        {type}
                      </Badge>
                    ))}
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Page & section mapping</li>
                    <li>• Embedded image OCR</li>
                    <li>• Context snippets & match jumps</li>
                  </ul>
                </div>
                <Button variant="outline" className="w-full mt-4 group-hover:bg-yellow-600 group-hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setSelectedTool("word") }}>
                  <FileText className="h-4 w-4 mr-2" />
                  Open Word Search
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* PPTX & XLSX Search */}
            <Card
              className="hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col group border hover:border-purple-500/40"
              onClick={() => setSelectedTool("pptx")}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2.5 bg-purple-100 dark:bg-purple-900/50 rounded-xl text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                    <span className="text-lg">📊</span>
                  </div>
                  PPTX & XLSX
                </CardTitle>
                <CardDescription className="text-xs">Slide decks & spreadsheets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-0">
                <div>
                  <p className="text-muted-foreground text-xs mb-3">
                    Search slides, tables, sheets, charts and extract text across workbooks.
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {[".pptx", ".xlsx", ".xls"].map((type) => (
                      <Badge key={type} className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" variant="outline">
                        {type}
                      </Badge>
                    ))}
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Slide-by-slide XML indexing</li>
                    <li>• Multi-sheet CSV flattening</li>
                    <li>• Embedded visual OCR</li>
                  </ul>
                </div>
                <Button variant="outline" className="w-full mt-4 group-hover:bg-purple-600 group-hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setSelectedTool("pptx") }}>
                  <span className="mr-2">📊</span>
                  Open PPTX / XLSX
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* PDF Search */}
            <Card
              className="hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col group border hover:border-red-500/40"
              onClick={() => setSelectedTool("pdf")}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <div className="p-2.5 bg-red-100 dark:bg-red-900/50 rounded-xl text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform">
                    <span className="text-lg">📄</span>
                  </div>
                  PDF Search
                </CardTitle>
                <CardDescription className="text-xs">PDF documents & scanned OCR</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-0">
                <div>
                  <p className="text-muted-foreground text-xs mb-3">
                    Extract text, metadata, and perform full-page OCR for scanned PDFs.
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {[".pdf"].map((type) => (
                      <Badge key={type} className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" variant="outline">
                        {type}
                      </Badge>
                    ))}
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Page-by-page text parsing</li>
                    <li>• Scanned image OCR engine</li>
                    <li>• Context snippet highlighting</li>
                  </ul>
                </div>
                <Button variant="outline" className="w-full mt-4 group-hover:bg-red-600 group-hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setSelectedTool("pdf") }}>
                  <span className="mr-2">📄</span>
                  Open PDF Search
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      )}
    </div>
  )
}
