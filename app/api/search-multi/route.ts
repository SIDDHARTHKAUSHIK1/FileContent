import { type NextRequest, NextResponse } from "next/server"

interface SearchRequest {
  query: string
  case_sensitive: boolean
  file_types: string[]
  selected_folder?: string
  selected_files?: Array<{
    name: string
    path: string
    content: string
    size: number
    type: string
    lastModified: number
  }>
}

interface SearchResult {
  file: string
  path: string
  type: string
  matched_text: string
  line_number?: number
}

interface ApiResponse {
  results: SearchResult[]
  stats: {
    files_scanned: number
    files_matched: number
    time_taken: number
    search_directory: string
  }
  error?: string
  debug?: any
}

function searchInText(
  text: string,
  query: string,
  caseSensitive: boolean,
): { found: boolean; snippet: string; lineNumber?: number } {
  if (!text || !query) {
    return { found: false, snippet: "" }
  }

  const searchText = caseSensitive ? text : text.toLowerCase()
  const searchQuery = caseSensitive ? query : query.toLowerCase()

  if (!searchText.includes(searchQuery)) {
    return { found: false, snippet: "" }
  }

  // Find line number
  let matchedLineNumber = 0
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = caseSensitive ? lines[i] : lines[i].toLowerCase()
    if (line.includes(searchQuery)) {
      matchedLineNumber = i + 1

      // Create snippet with context
      const contextLines = 2
      const startLine = Math.max(0, i - contextLines)
      const endLine = Math.min(lines.length, i + contextLines + 1)
      const snippet = lines.slice(startLine, endLine).join("\n")

      return {
        found: true,
        snippet: snippet,
        lineNumber: matchedLineNumber,
      }
    }
  }

  return { found: false, snippet: "" }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    let body: SearchRequest
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("JSON parse error:", parseError)
      return NextResponse.json(
        {
          results: [],
          stats: {
            files_scanned: 0,
            files_matched: 0,
            time_taken: Date.now() - startTime,
            search_directory: "Error",
          },
          error: "Invalid request format",
        } as ApiResponse,
        { status: 400 },
      )
    }

    if (!body?.query?.trim()) {
      return NextResponse.json(
        {
          results: [],
          stats: {
            files_scanned: 0,
            files_matched: 0,
            time_taken: Date.now() - startTime,
            search_directory: "Error",
          },
          error: "Search query is required",
        } as ApiResponse,
        { status: 400 },
      )
    }

    const { query, case_sensitive = false, file_types = [], selected_files = [] } = body

    if (!Array.isArray(file_types) || file_types.length === 0) {
      return NextResponse.json(
        {
          results: [],
          stats: {
            files_scanned: 0,
            files_matched: 0,
            time_taken: Date.now() - startTime,
            search_directory: "Error",
          },
          error: "No file types selected",
        } as ApiResponse,
        { status: 400 },
      )
    }

    console.log(`\n🔍 Starting multi-file search for: "${query}" (case sensitive: ${case_sensitive})`)

    const results: SearchResult[] = []
    const debugInfo: any[] = []

    if (selected_files && selected_files.length > 0) {
      for (const fileData of selected_files) {
        try {
          const fileExt = fileData.name.split(".").pop()?.toLowerCase() || ""

          // Skip Word documents in multi-file search
          if (fileExt === "doc" || fileExt === "docx") {
            continue
          }

          if (!file_types.includes(fileExt)) {
            continue
          }

          if (fileData.size > 5 * 1024 * 1024) {
            continue
          }

          const content = fileData.content
          if (!content || content.length === 0) {
            continue
          }

          const searchResult = searchInText(content, query, case_sensitive)

          debugInfo.push({
            file: fileData.name,
            found: searchResult.found,
            lineNumber: searchResult.lineNumber,
            contentLength: content.length,
          })

          if (searchResult.found) {
            console.log(`\n✅ MATCH FOUND in ${fileData.name}`)
            console.log(`   Line: ${searchResult.lineNumber || "Unknown"}`)

            results.push({
              file: fileData.name,
              path: fileData.path.split("/").slice(0, -1).join("/") || "/",
              type: fileExt,
              matched_text: searchResult.snippet,
              line_number: searchResult.lineNumber,
            })
          }
        } catch (fileError) {
          console.error(`Error processing file ${fileData.name}:`, fileError)
          continue
        }
      }
    } else {
      return NextResponse.json({
        results: [],
        stats: {
          files_scanned: 0,
          files_matched: 0,
          time_taken: Date.now() - startTime,
          search_directory: "No folder selected",
        },
        error: "Please select a folder first",
      } as ApiResponse)
    }

    const endTime = Date.now()
    const stats = {
      files_scanned: selected_files.length,
      files_matched: results.length,
      time_taken: endTime - startTime,
      search_directory: body.selected_folder || "Selected Files",
    }

    console.log(`\n📊 Multi-file search completed: ${results.length} matches found in ${selected_files.length} files`)

    return NextResponse.json({
      results,
      stats,
      debug: debugInfo.slice(0, 10),
    } as ApiResponse)
  } catch (error: any) {
    console.error("Multi-file search API error:", error)
    const endTime = Date.now()

    return NextResponse.json(
      {
        results: [],
        stats: {
          files_scanned: 0,
          files_matched: 0,
          time_taken: endTime - startTime,
          search_directory: "Error",
        },
        error: `Search failed: ${error.message}`,
      } as ApiResponse,
      { status: 500 },
    )
  }
}
