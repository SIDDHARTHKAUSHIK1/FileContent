"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Search,
  FileText,
  Loader2,
  Moon,
  Sun,
  ArrowLeft,
  Upload,
  Sparkles,
  Layers,
  BookOpen,
  Filter,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import AISearchChat from "@/components/ai-search-chat";
import {
  extractPdfPages,
  searchPdfPages,
  type PdfPage,
  type PdfSearchResult,
  type PdfSearchOptions,
} from "@/lib/pdf-parser";

interface PdfSearchProps {
  onBack?: () => void;
}

const PdfSearch: React.FC<PdfSearchProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PdfSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Search options
  const [searchMode, setSearchMode] = useState<"smart" | "exact" | "regex">("smart");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Stats
  const [searchStats, setSearchStats] = useState<{
    filesScanned: number;
    pagesScanned: number;
    matchesFound: number;
    timeTaken: number;
  } | null>(null);

  // Document viewer state
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);
  const [selectedPageNum, setSelectedPageNum] = useState(1);
  const [copied, setCopied] = useState(false);

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Handle file and folder upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (uploadedFiles.length === 0) return;

    // Filter for PDFs
    const validPdfFiles = uploadedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".pdf")
    );

    if (validPdfFiles.length === 0) {
      setError("No valid .pdf files found in the selection.");
      return;
    }

    setFiles(validPdfFiles);
    setError(null);
    setPdfPages([]);
    setResults([]);
    setSearchStats(null);
    setLoading(true);

    try {
      const allExtractedPages: PdfPage[] = [];

      for (let i = 0; i < validPdfFiles.length; i++) {
        const file = validPdfFiles[i];
        setStatusMessage(`Processing ${file.name} (${i + 1}/${validPdfFiles.length})...`);

        const pages = await extractPdfPages(file, (curr, tot, msg) => {
          setProgress({ current: curr, total: tot });
          setStatusMessage(msg);
        });

        allExtractedPages.push(...pages);
      }

      setPdfPages(allExtractedPages);
      setStatusMessage(`Successfully processed ${validPdfFiles.length} PDF(s) with ${allExtractedPages.length} pages total.`);
    } catch (err: any) {
      console.error("Error during PDF processing:", err);
      setError("Failed to parse PDF(s): " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  // Perform search
  const handleSearch = () => {
    setError(null);
    if (!query.trim()) {
      setResults([]);
      setSearchStats(null);
      return;
    }

    if (pdfPages.length === 0) {
      setError("Please upload at least one PDF document first.");
      return;
    }

    setIsSearching(true);
    const startTime = performance.now();

    try {
      const options: PdfSearchOptions = {
        mode: searchMode,
        caseSensitive,
        wholeWord,
      };

      const searchResults = searchPdfPages(pdfPages, query, options);
      const endTime = performance.now();

      const uniqueFiles = new Set(pdfPages.map((p) => p.fileName)).size;
      setResults(searchResults);
      setSearchStats({
        filesScanned: uniqueFiles,
        pagesScanned: pdfPages.length,
        matchesFound: searchResults.reduce((sum, r) => sum + r.matchCount, 0),
        timeTaken: Math.round(endTime - startTime),
      });
    } catch (err: any) {
      console.error("Search error:", err);
      setError("Search failed: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Concatenate all extracted PDF content for Gemini AI Context
  const allPdfContents = pdfPages
    .map(
      (p) =>
        `--- Document: ${p.fileName} | Page: ${p.pageNumber} ---\n${p.text}`
    )
    .join("\n\n");

  // Get distinct uploaded document names
  const uniqueDocNames = Array.from(new Set(pdfPages.map((p) => p.fileName)));
  const currentDocName = uniqueDocNames[selectedDocIndex] || "";
  const currentDocPages = pdfPages.filter((p) => p.fileName === currentDocName);
  const currentPageData =
    currentDocPages.find((p) => p.pageNumber === selectedPageNum) || currentDocPages[0];

  const handleCopyPageText = () => {
    if (currentPageData?.text) {
      navigator.clipboard.writeText(currentPageData.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Top Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <span className="p-1.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg">
                    📄
                  </span>
                  PDF Search & NLP Content Analyzer
                </h1>
                <p className="text-xs text-muted-foreground">
                  Content-based NLP keyword search, OCR parsing & Gemini AI Q&A
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setDarkMode(!darkMode)}
              title="Toggle theme"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main App Body */}
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <Tabs defaultValue="search" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              NLP Search
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="viewer" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Page Viewer
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: NLP SEARCH */}
          <TabsContent value="search" className="space-y-4">
            {/* Upload Area */}
            {pdfPages.length === 0 ? (
              <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors">
                <CardContent className="pt-8 pb-8 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center mb-4">
                    {loading ? (
                      <Loader2 className="h-6 w-6 text-red-600 animate-spin" />
                    ) : (
                      <Upload className="h-6 w-6 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {loading ? "Reading & Parsing PDF Documents..." : "Upload PDF Files or Folders"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    {loading
                      ? statusMessage
                      : "Drag & drop PDF documents or choose a folder. Supports scanned PDFs with built-in OCR."}
                  </p>

                  {loading && progress && (
                    <div className="max-w-xs mx-auto mb-4 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-red-600 h-full transition-all duration-300"
                        style={{
                          width: `${(progress.current / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  )}

                  {!loading && (
                    <div className="flex flex-wrap justify-center gap-3">
                      <label className="cursor-pointer">
                        <Button asChild variant="default">
                          <span>
                            <FileText className="h-4 w-4 mr-2" />
                            Select PDF Files
                          </span>
                        </Button>
                        <input
                          type="file"
                          multiple
                          accept=".pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>

                      <label className="cursor-pointer">
                        <Button asChild variant="outline">
                          <span>
                            <Layers className="h-4 w-4 mr-2" />
                            Select PDF Folder
                          </span>
                        </Button>
                        <input
                          type="file"
                          multiple
                          // @ts-ignore
                          webkitdirectory="true"
                          // @ts-ignore
                          directory="true"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Loaded Documents Badge Bar */
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg border">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Loaded {uniqueDocNames.length} Document(s) ({pdfPages.length} Pages):</span>
                  </div>
                  {uniqueDocNames.map((name) => {
                    const pagesCount = pdfPages.filter((p) => p.fileName === name).length;
                    return (
                      <Badge key={name} variant="secondary" className="text-xs">
                        📄 {name} ({pagesCount} p.)
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <Button variant="ghost" size="sm" asChild>
                      <span>
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Add More
                      </span>
                    </Button>
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFiles([]);
                      setPdfPages([]);
                      setResults([]);
                      setSearchStats(null);
                      setQuery("");
                    }}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Search Input & Controls */}
            {pdfPages.length > 0 && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search for text, multi-word terms, phrases in quotes..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pl-9"
                      />
                    </div>
                    <Button
                      onClick={handleSearch}
                      disabled={isSearching || !query.trim()}
                      className="min-w-[100px]"
                    >
                      {isSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4 mr-1.5" />
                      )}
                      Search
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowFilters(!showFilters)}
                      title="Search Settings"
                      className={showFilters ? "bg-muted" : ""}
                    >
                      <Filter className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Filter & NLP Options Bar */}
                  {showFilters && (
                    <div className="pt-2 border-t flex flex-wrap gap-6 items-center text-sm">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="search-mode" className="text-xs font-semibold">
                          Search Mode:
                        </Label>
                        <select
                          id="search-mode"
                          value={searchMode}
                          onChange={(e) => setSearchMode(e.target.value as any)}
                          className="text-xs border rounded px-2 py-1 bg-background"
                        >
                          <option value="smart">Smart NLP (Multi-keyword & Fuzzy)</option>
                          <option value="exact">Exact Phrase</option>
                          <option value="regex">Regular Expression</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="case-sensitive"
                          checked={caseSensitive}
                          onCheckedChange={setCaseSensitive}
                        />
                        <Label htmlFor="case-sensitive" className="text-xs cursor-pointer">
                          Case Sensitive
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="whole-word"
                          checked={wholeWord}
                          onCheckedChange={setWholeWord}
                        />
                        <Label htmlFor="whole-word" className="text-xs cursor-pointer">
                          Whole Words Only
                        </Label>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Search Statistics */}
            {searchStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold text-primary">
                    {searchStats.filesScanned}
                  </div>
                  <div className="text-xs text-muted-foreground">Documents</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold text-blue-600">
                    {searchStats.pagesScanned}
                  </div>
                  <div className="text-xs text-muted-foreground">Pages Scanned</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold text-green-600">
                    {searchStats.matchesFound}
                  </div>
                  <div className="text-xs text-muted-foreground">Matches Found</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold text-purple-600">
                    {searchStats.timeTaken}ms
                  </div>
                  <div className="text-xs text-muted-foreground">Search Time</div>
                </Card>
              </div>
            )}

            {/* Search Results List */}
            {results.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    Matching Results ({results.length} pages matched)
                  </h2>
                </div>

                {results.map((result, idx) => (
                  <Card key={idx} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-red-600 font-medium text-sm flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            {result.fileName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            Page {result.pageNumber}
                          </Badge>
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {result.matchCount} match{result.matchCount > 1 ? "es" : ""}
                          </Badge>
                        </div>

                        {result.matchedWords && result.matchedWords.length > 0 && (
                          <div className="flex gap-1">
                            {result.matchedWords.slice(0, 3).map((w, wi) => (
                              <Badge
                                key={wi}
                                className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 text-[10px]"
                              >
                                {w}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Highlighted Snippet */}
                      <div className="p-3 bg-muted/60 rounded-md border text-sm font-mono leading-relaxed">
                        <div
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                          className="whitespace-pre-wrap"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : query && !isSearching && pdfPages.length > 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <h3 className="font-semibold text-base">No matches found</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  No pages matching &ldquo;{query}&rdquo; were found. Try searching with fewer words, enabling Smart NLP mode, or switching to the AI Assistant tab.
                </p>
              </div>
            ) : null}
          </TabsContent>

          {/* TAB 2: AI SEARCH CHAT */}
          <TabsContent value="ai">
            <div className="h-[calc(100vh-280px)] min-h-[500px]">
              <AISearchChat fileContent={allPdfContents} />
            </div>
          </TabsContent>

          {/* TAB 3: DOCUMENT CONTENT VIEWER */}
          <TabsContent value="viewer" className="space-y-4">
            {pdfPages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Upload a PDF document first to view its extracted text.</p>
              </div>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        Document Content Inspector
                      </CardTitle>
                      <CardDescription>
                        View the raw extracted text page-by-page
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Document Selector */}
                      <select
                        value={selectedDocIndex}
                        onChange={(e) => {
                          setSelectedDocIndex(Number(e.target.value));
                          setSelectedPageNum(1);
                        }}
                        className="text-xs border rounded px-2 py-1.5 bg-background max-w-[200px] truncate"
                      >
                        {uniqueDocNames.map((name, i) => (
                          <option key={name} value={i}>
                            {name}
                          </option>
                        ))}
                      </select>

                      {/* Page Selector */}
                      <select
                        value={selectedPageNum}
                        onChange={(e) => setSelectedPageNum(Number(e.target.value))}
                        className="text-xs border rounded px-2 py-1.5 bg-background"
                      >
                        {currentDocPages.map((p) => (
                          <option key={p.pageNumber} value={p.pageNumber}>
                            Page {p.pageNumber} of {currentDocPages.length}
                          </option>
                        ))}
                      </select>

                      {/* Copy Page Text Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyPageText}
                        className="text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1 text-green-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy Text
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="p-4 bg-muted/40 rounded-lg border font-mono text-xs max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {currentPageData ? (
                      currentPageData.text || "[No text found on this page]"
                    ) : (
                      "[No content]"
                    )}
                  </div>
                  {currentPageData && (
                    <div className="mt-2 text-xs text-muted-foreground flex justify-between">
                      <span>Words: {currentPageData.wordCount}</span>
                      <span>Characters: {currentPageData.charCount}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PdfSearch;
