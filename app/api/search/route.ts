import { type NextRequest, NextResponse } from "next/server"

interface SearchRequest {
  query: string
  case_sensitive: boolean
  pdf_only: boolean
  file_types: string[]
  selected_folder?: string
  selected_files?: Array<{
    name: string
    path: string
    content: string
    size: number
    type: string
    lastModified: number
    pages?: Array<{
      pageNumber: number
      content: string
      startIndex: number
      endIndex: number
    }>
  }>
}

interface SearchResult {
  file: string
  path: string
  type: string
  matched_text: string
  line_number?: number
  page_number?: number
  page_info?: string
  full_content?: string
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

function findExactPageForMatch(
  text: string,
  query: string,
  caseSensitive: boolean,
  pages?: Array<{
    pageNumber: number
    content: string
    startIndex: number
    endIndex: number
  }>,
  fileName?: string,
): { pageNumber?: number; pageInfo?: string; snippet: string; matchPosition?: number } {
  const searchText = caseSensitive ? text : text.toLowerCase()
  const searchQuery = caseSensitive ? query : query.toLowerCase()

  // Find the first occurrence of the query in the full text
  const matchPosition = searchText.indexOf(searchQuery)

  if (matchPosition === -1) {
    return { snippet: "No match found" }
  }

  console.log(`\n=== Searching for "${query}" in ${fileName} ===`)
  console.log(`Match found at position ${matchPosition} in full text`)

  if (!pages || pages.length <= 1) {
    console.log("Single page document or no pages")
    const snippet = extractSnippetAtPosition(text, matchPosition, query.length)
    return {
      pageNumber: 1,
      pageInfo: "Page 1",
      snippet,
      matchPosition,
    }
  }

  console.log(`Document has ${pages.length} pages:`)
  pages.forEach((page) => {
    console.log(
      `  Page ${page.pageNumber}: positions ${page.startIndex}-${page.endIndex} (${page.content.length} chars)`,
    )
  })

  // Method 1: Find page by exact character position
  for (const page of pages) {
    if (matchPosition >= page.startIndex && matchPosition <= page.endIndex) {
      console.log(
        `✓ Found match in Page ${page.pageNumber} by position (${matchPosition} is between ${page.startIndex}-${page.endIndex})`,
      )
      const snippet = extractSnippetAtPosition(page.content, matchPosition - page.startIndex, query.length)
      return {
        pageNumber: page.pageNumber,
        pageInfo: `Page ${page.pageNumber}`,
        snippet,
        matchPosition,
      }
    }
  }

  // Method 2: Search directly in each page content (most reliable)
  for (const page of pages) {
    const pageSearchText = caseSensitive ? page.content : page.content.toLowerCase()
    if (pageSearchText.includes(searchQuery)) {
      console.log(`✓ Found match in Page ${page.pageNumber} by direct content search`)
      const pageMatchPos = pageSearchText.indexOf(searchQuery)
      const snippet = extractSnippetAtPosition(page.content, pageMatchPos, query.length)
      return {
        pageNumber: page.pageNumber,
        pageInfo: `Page ${page.pageNumber}`,
        snippet,
        matchPosition,
      }
    }
  }

  // Method 3: Find the page with the closest position
  let closestPage = pages[0]
  let closestDistance = Math.abs(matchPosition - pages[0].startIndex)

  for (const page of pages) {
    const distanceToStart = Math.abs(matchPosition - page.startIndex)
    const distanceToEnd = Math.abs(matchPosition - page.endIndex)
    const minDistance = Math.min(distanceToStart, distanceToEnd)

    if (minDistance < closestDistance) {
      closestDistance = minDistance
      closestPage = page
    }
  }

  console.log(`✓ Using closest page ${closestPage.pageNumber} (distance: ${closestDistance})`)
  const snippet = extractSnippetAtPosition(text, matchPosition, query.length)

  return {
    pageNumber: closestPage.pageNumber,
    pageInfo: `Page ${closestPage.pageNumber}`,
    snippet,
    matchPosition,
  }
}

function extractSnippetAtPosition(text: string, position: number, queryLength: number): string {
  const contextBefore = 100
  const contextAfter = 100

  const start = Math.max(0, position - contextBefore)
  const end = Math.min(text.length, position + queryLength + contextAfter)

  let snippet = text.substring(start, end).trim()

  if (start > 0) snippet = "..." + snippet
  if (end < text.length) snippet = snippet + "..."

  return snippet
}

function searchInText(
  text: string,
  query: string,
  caseSensitive: boolean,
  pages?: Array<{
    pageNumber: number
    content: string
    startIndex: number
    endIndex: number
  }>,
  fileName?: string,
): { found: boolean; snippet: string; lineNumber?: number; pageNumber?: number; pageInfo?: string } {
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
      break
    }
  }

  // Find exact page
  const pageResult = findExactPageForMatch(text, query, caseSensitive, pages, fileName)

  return {
    found: true,
    snippet: pageResult.snippet,
    lineNumber: matchedLineNumber > 0 ? matchedLineNumber : undefined,
    pageNumber: pageResult.pageNumber,
    pageInfo: pageResult.pageInfo,
  }
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

    console.log(`\n🔍 Starting search for: "${query}" (case sensitive: ${case_sensitive})`)

    const results: SearchResult[] = []
    const debugInfo: any[] = []

    if (selected_files && selected_files.length > 0) {
      for (const fileData of selected_files) {
        try {
          const fileExt = fileData.name.split(".").pop()?.toLowerCase() || ""

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

          const searchResult = searchInText(content, query, case_sensitive, fileData.pages, fileData.name)

          debugInfo.push({
            file: fileData.name,
            found: searchResult.found,
            pageNumber: searchResult.pageNumber,
            pageInfo: searchResult.pageInfo,
            pageCount: fileData.pages?.length || 0,
            contentLength: content.length,
          })

          if (searchResult.found) {
            console.log(`\n✅ MATCH FOUND in ${fileData.name}`)
            console.log(`   Page: ${searchResult.pageInfo || "Unknown"}`)
            console.log(`   Line: ${searchResult.lineNumber || "Unknown"}`)

            results.push({
              file: fileData.name,
              path: fileData.path.split("/").slice(0, -1).join("/") || "/",
              type: fileExt,
              matched_text: searchResult.snippet,
              line_number: searchResult.lineNumber,
              page_number: searchResult.pageNumber,
              page_info: searchResult.pageInfo,
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

    console.log(`\n📊 Search completed: ${results.length} matches found in ${selected_files.length} files`)

    return NextResponse.json({
      results,
      stats,
      debug: debugInfo.slice(0, 10),
    } as ApiResponse)
  } catch (error: any) {
    console.error("Search API error:", error)
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
        error: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      } as ApiResponse,
      { status: 500 },
    )
  }
}
