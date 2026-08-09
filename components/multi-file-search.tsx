"use client"

import { useState, useEffect } from "react"
import { Search, FileText, File, Code, Loader2, Moon, Sun, AlertCircle, Info, ArrowLeft, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import FolderSelector from "@/components/folder-selector"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import AISearchChat from "@/components/ai-search-chat"
import type { RagDocumentInput } from "@/lib/rag-types"

interface SearchResult {
  file: string
  path: string
  type: string
  matched_text: string
  line_number?: number
}

interface SearchStats {
  files_scanned: number
  files_matched: number
  time_taken: number
  search_directory: string
}

const FILE_TYPE_ICONS = {
  txt: FileText,
  md: FileText,
  html: Code,
  js: Code,
  py: Code,
  json: Code,
  csv: File,
  java: Code,
  tsx: Code,
  ts: Code,
  jsx: Code,
  default: File,
}

const FILE_TYPE_COLORS = {
  txt: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  md: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  html: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  js: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  py: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  json: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  csv: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  java: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  tsx: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ts: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  jsx: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  default: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

interface MultiFileSearchProps {
  onBack: () => void
}

export default function MultiFileSearch({ onBack }: MultiFileSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [stats, setStats] = useState<SearchStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState("")
  const [selectedFileTypes, setSelectedFileTypes] = useState<string[]>([
    "txt",
    "md",
    "html",
    "js",
    "py",
    "json",
    "csv",
    "java",
    "tsx",
    "ts",
    "jsx",
  ])
  const [showFilters, setShowFilters] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<RagDocumentInput[]>([])

  const fileTypes = [
    { id: "txt", label: "Text", icon: FileText },
    { id: "md", label: "Markdown", icon: FileText },
    { id: "html", label: "HTML", icon: Code },
    { id: "js", label: "JavaScript", icon: Code },
    { id: "jsx", label: "React JS", icon: Code },
    { id: "ts", label: "TypeScript", icon: Code },
    { id: "tsx", label: "React TS", icon: Code },
    { id: "py", label: "Python", icon: Code },
    { id: "json", label: "JSON", icon: Code },
    { id: "csv", label: "CSV", icon: File },
    { id: "java", label: "Java", icon: Code },
  ]

  const allowedExts = [
    "txt", "md", "html", "js", "jsx", "ts", "tsx", "py", "json", "csv", "java"
  ]

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setResults([])
    setStats(null)
    setError(null)
    setDebugInfo([])

    try {
      const selectedFilesJson = localStorage.getItem("selectedFiles")
      const selectedFiles = selectedFilesJson ? JSON.parse(selectedFilesJson) : []

      // Check for unsupported file formats
      const unsupported = selectedFiles.some((file: any) => {
        const ext = file.name.toLowerCase().split(".").pop()
        return !allowedExts.includes(ext || "")
      })
      if (unsupported) {
        setError("Unsupported File Format")
        setResults([])
        setStats(null)
        setDebugInfo([])
        setLoading(false)
        return
      }

      const response = await fetch("/api/search-multi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          case_sensitive: caseSensitive,
          file_types: selectedFileTypes,
          selected_folder: selectedFolder,
          selected_files: selectedFiles,
        }),
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        setResults([])
        setStats(null)
      } else {
        setResults(data.results || [])
        setStats(data.stats || null)
        setDebugInfo(data.debug || [])
        setError(null)
      }
    } catch (error) {
      console.error("Search error:", error)
      setError("Failed to perform search. Please try again.")
      setResults([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  const handleFileTypeToggle = (fileType: string) => {
    setSelectedFileTypes((prev) =>
      prev.includes(fileType) ? prev.filter((type) => type !== fileType) : [...prev, fileType],
    )
  }

  const highlightText = (text: string, query: string) => {
    if (!query) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, caseSensitive ? "g" : "gi")
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>')
  }

  const getFileIcon = (fileType: string) => {
    const IconComponent = FILE_TYPE_ICONS[fileType as keyof typeof FILE_TYPE_ICONS] || FILE_TYPE_ICONS.default
    return <IconComponent className="h-4 w-4" />
  }

  const getFileTypeColor = (fileType: string) => {
    return FILE_TYPE_COLORS[fileType as keyof typeof FILE_TYPE_COLORS] || FILE_TYPE_COLORS.default
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <h1 className="text-xl font-bold">Multi-File Search</h1>
            </div>
            <Button variant="outline" size="icon" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>

          <div className="mb-3">
            <FolderSelector
              selectedFolder={selectedFolder}
              onFolderSelect={(folderName) => setSelectedFolder(folderName)}
              onFolderClear={() => {
                setSelectedFolder("")
                setUploadedDocuments([])
              }}
              onDocumentsLoaded={setUploadedDocuments}
            />
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search for text, keywords, or phrases..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-10 h-9"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={loading || !query.trim() || selectedFileTypes.length === 0}
                className="h-9"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="h-9">
                Filters
              </Button>
            </div>

            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
              <CollapsibleContent className="space-y-3">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center space-x-2">
                    <Switch id="case-sensitive" checked={caseSensitive} onCheckedChange={setCaseSensitive} />
                    <Label htmlFor="case-sensitive" className="text-sm">
                      Case Sensitive
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="show-debug" checked={showDebug} onCheckedChange={setShowDebug} />
                    <Label htmlFor="show-debug" className="text-sm">
                      Show Debug Info
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">File Types:</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                    {fileTypes.map((fileType) => (
                      <div key={fileType.id} className="flex items-center space-x-1">
                        <Checkbox
                          id={fileType.id}
                          checked={selectedFileTypes.includes(fileType.id)}
                          onCheckedChange={() => handleFileTypeToggle(fileType.id)}
                        />
                        <Label htmlFor={fileType.id} className="flex items-center gap-1 text-xs">
                          <fileType.icon className="h-3 w-3" />
                          {fileType.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)] overflow-y-auto">
        <div className="container mx-auto px-4 py-4">
          <Tabs defaultValue="search">
            <TabsList className="mb-4">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-purple-500" />
                AI Search
              </TabsTrigger>
            </TabsList>
            <TabsContent value="search">
              {error && (
                <div className="text-red-600 font-bold text-center mb-4">{error}</div>
              )}

              {showDebug && debugInfo.length > 0 && (
                <Collapsible className="mb-4">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full bg-transparent">
                      <Info className="h-4 w-4 mr-2" />
                      Debug Information ({debugInfo.length} entries)
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Card className="mt-2">
                      <CardContent className="pt-4">
                        <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(debugInfo, null, 2)}</pre>
                      </CardContent>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {stats && (
                <Card className="mb-4">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-xl font-bold text-primary">{stats.files_scanned}</div>
                        <div className="text-xs text-muted-foreground">Files Scanned</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-green-600">{stats.files_matched}</div>
                        <div className="text-xs text-muted-foreground">Files Matched</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-blue-600">{stats.time_taken}ms</div>
                        <div className="text-xs text-muted-foreground">Search Time</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-purple-600">{stats.search_directory}</div>
                        <div className="text-xs text-muted-foreground">Directory</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="ml-2">Searching files...</span>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">Search Results ({results.length})</h2>
                  {results.map((result, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getFileIcon(result.type)}
                            <div>
                              <h3 className="font-semibold text-sm">{result.file}</h3>
                              <p className="text-xs text-muted-foreground">{result.path}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Badge className={getFileTypeColor(result.type)} variant="secondary">
                              {result.type.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <div className="bg-muted p-3 rounded-md">
                          <div
                            className="text-sm font-mono"
                            dangerouslySetInnerHTML={{
                              __html: highlightText(result.matched_text, query),
                            }}
                          />
                          {result.line_number && (
                            <div className="text-xs text-muted-foreground mt-2">Line {result.line_number}</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : query && !loading && !error ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No results found</h3>
                  <p className="text-muted-foreground">No files containing "{query}" were found.</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Start searching</h3>
                  <p className="text-muted-foreground">
                    {selectedFolder
                      ? `Enter a keyword to search within "${selectedFolder}"`
                      : "Select a folder first, then enter a keyword to search"}
                  </p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="ai">
              <div className="h-[calc(100vh-300px)]">
                <AISearchChat documents={uploadedDocuments} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
