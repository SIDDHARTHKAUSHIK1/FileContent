"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { FolderOpen, Upload, X, Folder } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { parseWordDocument } from "@/lib/word-parser"
import type { RagDocumentInput } from "@/lib/rag-types"

interface FolderSelectorProps {
  selectedFolder: string
  onFolderSelect: (folderName: string, folderPath?: string) => void
  onFolderClear: () => void
  onDocumentsLoaded?: (documents: RagDocumentInput[]) => void
  onAdvancedDocumentProcess?: (file: File) => Promise<void>
}

interface FileData {
  name: string
  path: string
  content: string
  size: number
  type: string
  lastModified: number
  isDocFile?: boolean // Add flag for .doc files
  pages?: Array<{
    pageNumber: number
    content: string
    startIndex: number
    endIndex: number
  }>
}

export default function FolderSelector({
  selectedFolder,
  onFolderSelect,
  onFolderClear,
  onDocumentsLoaded,
  onAdvancedDocumentProcess,
}: FolderSelectorProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [folderStats, setFolderStats] = useState<{ fileCount: number; folderCount: number } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>("")

  const readFileContent = async (file: File): Promise<{ content: string; pages?: any[]; isDocFile?: boolean }> => {
    const fileName = file.name.toLowerCase()

    if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
      try {
        setProcessingStatus(`Processing Word document: ${file.name}`)
        const wordResult = await parseWordDocument(file)

        // Check if this was an error result
        if (wordResult.text.startsWith("[Error parsing") || wordResult.text.startsWith("[Note:")) {
          console.warn(`Word parsing issue for ${file.name}:`, wordResult.text)
          return {
            content: wordResult.text,
            pages: wordResult.pages,
            isDocFile: wordResult.isDocFile,
          }
        }

        return {
          content: wordResult.text,
          pages: wordResult.pages,
          isDocFile: wordResult.isDocFile,
        }
      } catch (error) {
        console.error(`Error parsing Word document ${file.name}:`, error)
        const errorMessage = `[Could not parse Word document "${file.name}". ${fileName.endsWith(".doc") ? "For better results, try converting to .docx format." : "The file may be corrupted."}]`
        return {
          content: errorMessage,
          pages: [
            {
              pageNumber: 1,
              content: errorMessage,
              startIndex: 0,
              endIndex: errorMessage.length,
            },
          ],
          isDocFile: fileName.endsWith(".doc"),
        }
      }
    } else {
      // Regular text file
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve({ content: (e.target?.result as string) || "" })
        reader.onerror = (e) => {
          console.error(`Error reading file ${file.name}:`, e)
          resolve({ content: `[Error reading file: ${file.name}]` })
        }
        reader.readAsText(file)
      })
    }
  }

  const processForAdvancedSearch = useCallback(
    async (files: File[]) => {
      const allowedExts = ["doc", "docx", "txt", "md", "html", "js", "jsx", "ts", "tsx", "py", "json", "csv", "java"];
      const unsupported = files.some(file => {
        const ext = file.name.toLowerCase().split(".").pop();
        return !allowedExts.includes(ext || "");
      });
      if (unsupported) {
        setProcessingStatus("Unsupported File Format");
        return;
      }

      const docFiles = files.filter((file) => {
        const ext = file.name.toLowerCase().split(".").pop()
        return ["doc", "docx", "txt"].includes(ext || "")
      })

      if (docFiles.length > 0 && onAdvancedDocumentProcess) {
        try {
          await onAdvancedDocumentProcess(docFiles[0])
        } catch (error) {
          console.error("Error processing document for advanced search:", error)
        }
      }
    },
    [onAdvancedDocumentProcess],
  )

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      setIsProcessing(true)
      setProcessingStatus("Processing dropped folder...")

      const items = e.dataTransfer.items
      const files: File[] = []

      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.kind === "file") {
            const entry = item.webkitGetAsEntry()
            if (entry && entry.isDirectory) {
              await traverseDirectory(entry, files)

              if (files.length > 0) {
                const folderName = entry.name
                setFolderStats({ fileCount: files.length, folderCount: 0 })
                onFolderSelect(folderName, entry.fullPath)

                const fileDataArray: FileData[] = []

                for (const file of files.slice(0, 100)) {
                  try {
                    setProcessingStatus(`Processing: ${file.name}`)
                    const { content, pages, isDocFile } = await readFileContent(file)
                    fileDataArray.push({
                      name: file.name,
                      path: file.webkitRelativePath || file.name,
                      content: content,
                      size: file.size,
                      type: file.type,
                      lastModified: file.lastModified,
                      pages: pages,
                      isDocFile: isDocFile,
                    })
                  } catch (error) {
                    console.error(`Error reading file ${file.name}:`, error)
                    fileDataArray.push({
                      name: file.name,
                      path: file.webkitRelativePath || file.name,
                      content: "",
                      size: file.size,
                      type: file.type,
                      lastModified: file.lastModified,
                    })
                  }
                }

                localStorage.setItem("selectedFiles", JSON.stringify(fileDataArray))
                onDocumentsLoaded?.(fileDataArray.map((file) => ({
                  id: `${file.path}-${file.lastModified}`,
                  name: file.name,
                  path: file.path,
                  content: file.content,
                })))
                console.log(`Stored ${fileDataArray.length} files with content`)
                await processForAdvancedSearch(files.slice(0, 100))
              }
              break
            }
          }
        }
      }
      setIsProcessing(false)
      setProcessingStatus("")
    },
    [onDocumentsLoaded, onFolderSelect, processForAdvancedSearch],
  )

  const handleFolderSelect = async () => {
    setIsProcessing(true)
    setProcessingStatus("Selecting folder...")

    const input = document.createElement("input")
    input.type = "file"
    input.webkitdirectory = true
    input.multiple = true
    input.style.display = "none"

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        const firstFile = files[0]
        const pathParts = firstFile.webkitRelativePath.split("/")
        const folderName = pathParts[0]

        const fileCount = files.length
        const folderSet = new Set<string>()

        Array.from(files).forEach((file) => {
          const parts = file.webkitRelativePath.split("/")
          for (let i = 1; i < parts.length; i++) {
            folderSet.add(parts.slice(0, i + 1).join("/"))
          }
        })

        setFolderStats({ fileCount, folderCount: folderSet.size })
        onFolderSelect(folderName, firstFile.webkitRelativePath)

        const fileDataArray: FileData[] = []
        const filesToProcess = Array.from(files).slice(0, 100)

        for (const file of filesToProcess) {
          try {
            setProcessingStatus(`Processing: ${file.name}`)
            const { content, pages, isDocFile } = await readFileContent(file)
            fileDataArray.push({
              name: file.name,
              path: file.webkitRelativePath,
              content: content,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
              pages: pages,
              isDocFile: isDocFile,
            })
          } catch (error) {
            console.error(`Error reading file ${file.name}:`, error)
            fileDataArray.push({
              name: file.name,
              path: file.webkitRelativePath,
              content: "",
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
            })
          }
        }

        localStorage.setItem("selectedFiles", JSON.stringify(fileDataArray))
        onDocumentsLoaded?.(fileDataArray.map((file) => ({
          id: `${file.path}-${file.lastModified}`,
          name: file.name,
          path: file.path,
          content: file.content,
        })))
        console.log(`Stored ${fileDataArray.length} files with content`)
        await processForAdvancedSearch(filesToProcess)
      }

      document.body.removeChild(input)
      setIsProcessing(false)
      setProcessingStatus("")
    }

    document.body.appendChild(input)
    input.click()
  }

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const clearFolder = () => {
    onFolderClear()
    onDocumentsLoaded?.([])
    setFolderStats(null)
    localStorage.removeItem("selectedFiles")
  }

  const traverseDirectory = async (entry: any, files: File[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => {
        entry.file(resolve)
      })
      files.push(file)
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      const entries = await new Promise<any[]>((resolve) => {
        reader.readEntries(resolve)
      })

      for (const childEntry of entries) {
        await traverseDirectory(childEntry, files)
      }
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Search Directory:</Label>

      {selectedFolder ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedFolder}</p>
                  {folderStats && (
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {folderStats.fileCount} files
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Content loaded
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFolder}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer ${
            isDragOver
              ? "border-primary bg-primary/5 scale-105"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
          }`}
          onDrop={handleFolderDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleFolderSelect}
        >
          <div className="space-y-3">
            <div
              className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isDragOver ? "bg-primary/20" : "bg-muted"
              }`}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              ) : isDragOver ? (
                <Upload className="h-6 w-6 text-primary" />
              ) : (
                <Folder className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium mb-1">
                {isProcessing ? "Processing files..." : isDragOver ? "Drop folder here" : "Select a folder to search"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isProcessing ? processingStatus : "Drag and drop a folder or click to browse your computer"}
              </p>
            </div>
          </div>
        </div>
      )}
      {processingStatus && processingStatus === "Unsupported File Format" && (
        <div className="text-red-600 font-bold text-center mb-2">{processingStatus}</div>
      )}
    </div>
  )
}
