"use client"

import React, { useEffect, useRef, useState } from "react"
import { Bot, FileText, Key, Loader2, Send, Sparkles, Upload, User, Check, AlertCircle, ExternalLink, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { RagDocumentInput, RagSource } from "@/lib/rag-types"

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  sources?: RagSource[]
}

interface IndexedCorpus {
  fingerprint: string
  indexId: string
  documentCount: number
  chunkCount: number
}

interface LargeUploadSession {
  uploadId: string
  fileCount: number
  totalBytes: number
}

interface UploadIndexJob {
  jobId: string
  status: "indexing" | "complete" | "failed"
  fileCount: number
  processedFiles: number
  totalBytes: number
  processedBytes: number
  chunkCount: number
  currentFile?: string
  indexId?: string
  error?: string
}

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

interface AISearchChatProps {
  documents?: RagDocumentInput[]
  getDocuments?: () => Promise<RagDocumentInput[]>
  hasDocuments?: boolean
}

function fingerprintDocuments(documents: RagDocumentInput[]) {
  let hash = 0
  for (const document of documents) {
    const value = `${document.id}|${document.name}|${document.path || ""}|${document.content}`
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0
    }
  }
  return `${documents.length}:${hash}`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  return `${(bytes / 1024 ** (exponent + 1)).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export default function AISearchChat({ documents = [], getDocuments, hasDocuments }: AISearchChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [largeUpload, setLargeUpload] = useState<LargeUploadSession | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // Custom API key management (stored in localStorage for Vercel/client-side users)
  const [apiKey, setApiKey] = useState("")
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  const indexRef = useRef<IndexedCorpus | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem("nvidia_api_key") || ""
    if (saved) setApiKey(saved)
  }, [])

  const saveCustomKey = (key: string) => {
    const clean = key.trim()
    setApiKey(clean)
    if (clean) {
      localStorage.setItem("nvidia_api_key", clean)
    } else {
      localStorage.removeItem("nvidia_api_key")
    }
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2500)
    setShowKeyInput(false)
    setError(null)
  }

  const clearCustomKey = () => {
    setApiKey("")
    localStorage.removeItem("nvidia_api_key")
    setError(null)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const activeKey = apiKey.trim() || (typeof window !== "undefined" ? localStorage.getItem("nvidia_api_key") || "" : "")
    if (activeKey) {
      headers["x-nvidia-api-key"] = activeKey
    }
    return headers
  }

  const loadDocuments = async () => {
    const loadedDocuments = getDocuments ? await getDocuments() : documents
    return loadedDocuments.filter((document) => document.content.trim().length > 0)
  }

  const ensureIndex = async (uploadedDocuments: RagDocumentInput[]) => {
    const fingerprint = fingerprintDocuments(uploadedDocuments)
    if (indexRef.current?.fingerprint === fingerprint) {
      return indexRef.current.indexId
    }

    setIndexStatus("Building document search index…")
    const response = await fetch("/api/rag/index", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        documents: uploadedDocuments.map((document) => ({
          id: document.id,
          name: document.name,
          path: document.path,
          content: document.content,
        })),
        apiKey: apiKey.trim() || undefined,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      if (data.error?.includes("401") || data.error?.includes("NVIDIA_API_KEY") || data.error?.includes("Unauthorized")) {
        setShowKeyInput(true)
      }
      throw new Error(data.error || "Failed to index documents.")
    }

    const payload = (await response.json()) as { indexId: string; documentCount: number; chunkCount: number }
    indexRef.current = {
      fingerprint,
      indexId: payload.indexId,
      documentCount: payload.documentCount,
      chunkCount: payload.chunkCount,
    }
    setIndexStatus(`Indexed ${payload.documentCount} file${payload.documentCount === 1 ? "" : "s"} (${payload.chunkCount} chunks)`)
    return payload.indexId
  }

  const pollJobUntilComplete = async (jobId: string) => {
    while (true) {
      const response = await fetch(`/api/rag/index?jobId=${encodeURIComponent(jobId)}`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(data.error || "Failed to inspect indexing job.")
      }

      const job = (await response.json()) as UploadIndexJob
      if (job.status === "failed") throw new Error(job.error || "Indexing failed.")

      setIndexStatus(`Indexing files (${job.processedFiles}/${job.fileCount}) • ${job.chunkCount} chunks`)

      if (job.status === "complete") {
        if (!job.indexId) throw new Error("Index job completed without an index ID.")
        return job.indexId
      }

      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }

  const ensureUploadedIndex = async (session: LargeUploadSession) => {
    if (indexRef.current?.fingerprint === session.uploadId) {
      return indexRef.current.indexId
    }

    setIndexStatus(`Queuing index build for ${session.fileCount} uploaded files…`)
    const response = await fetch("/api/rag/index", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ uploadId: session.uploadId, apiKey: apiKey.trim() || undefined }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      if (data.error?.includes("401") || data.error?.includes("NVIDIA_API_KEY") || data.error?.includes("Unauthorized")) {
        setShowKeyInput(true)
      }
      throw new Error(data.error || "Failed to start index job.")
    }

    const payload = (await response.json()) as { jobId: string }
    const indexId = await pollJobUntilComplete(payload.jobId)

    indexRef.current = {
      fingerprint: session.uploadId,
      indexId,
      documentCount: session.fileCount,
      chunkCount: 0,
    }
    setIndexStatus(`Ready — indexed ${session.fileCount} files`)
    return indexId
  }

  const uploadFilesDirectly = async (files: File[]) => {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`Total upload exceeds ${formatBytes(MAX_UPLOAD_BYTES)} limit.`)
    }

    setIsUploading(true)
    setUploadProgress(0)
    setError(null)
    setLargeUpload(null)
    indexRef.current = null

    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append("files", file, (file as any).webkitRelativePath || file.name)
      }

      const uploadPromise = new Promise<{ uploadId: string; fileCount: number; totalBytes: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", "/api/uploads")

        const activeKey = apiKey.trim() || (typeof window !== "undefined" ? localStorage.getItem("nvidia_api_key") || "" : "")
        if (activeKey) {
          xhr.setRequestHeader("x-nvidia-api-key", activeKey)
        }

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return
          const percentage = Math.round((event.loaded / event.total) * 100)
          setUploadProgress(percentage)
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const parsed = JSON.parse(xhr.responseText)
              resolve(parsed)
            } catch (err) {
              reject(new Error("Malformed upload response."))
            }
          } else {
            try {
              const parsed = JSON.parse(xhr.responseText)
              reject(new Error(parsed.error || `Upload failed (HTTP ${xhr.status})`))
            } catch {
              reject(new Error(`Upload failed (HTTP ${xhr.status})`))
            }
          }
        }

        xhr.onerror = () => reject(new Error("Network error during file upload."))
        xhr.send(formData)
      })

      const result = await uploadPromise
      setLargeUpload(result)
      setIndexStatus(`Uploaded ${result.fileCount} files (${formatBytes(result.totalBytes)}). Ready to index.`)
    } finally {
      setIsUploading(false)
      setUploadProgress(null)
    }
  }

  const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    if (files.length === 0) return

    try {
      await uploadFilesDirectly(files)
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "File upload failed."
      setError(message)
    } finally {
      setUploadProgress(null)
      event.target.value = ""
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const question = inputValue.trim()
    if (!question || isLoading) return

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      type: "user",
      content: question,
      timestamp: new Date(),
    }
    setMessages((current) => [...current, userMessage])
    setInputValue("")
    setIsLoading(true)
    setError(null)

    try {
      const indexId = largeUpload
        ? await ensureUploadedIndex(largeUpload)
        : await (async () => {
            const uploadedDocuments = await loadDocuments()
            if (uploadedDocuments.length === 0) throw new Error("Upload a readable document before asking the AI.")
            return ensureIndex(uploadedDocuments)
          })()

      const response = await fetch("/api/ai-search", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ question, indexId, stream: true, apiKey: apiKey.trim() || undefined }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        if (data.error?.includes("401") || data.error?.includes("NVIDIA_API_KEY") || data.error?.includes("Unauthorized")) {
          setShowKeyInput(true)
        }
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("The AI response stream was unavailable.")

      const aiMessage: Message = {
        id: `${Date.now()}-ai`,
        type: "ai",
        content: "",
        timestamp: new Date(),
      }
      setMessages((current) => [...current, aiMessage])

      const decoder = new TextDecoder()
      let buffer = ""
      let streamError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = JSON.parse(line.slice(6)) as { type?: string; chunk?: string; sources?: RagSource[]; error?: string }

          if (payload.type === "sources" && payload.sources) {
            setMessages((current) => current.map((message) => (message.id === aiMessage.id ? { ...message, sources: payload.sources } : message)))
          }
          if (payload.type === "chunk" && payload.chunk) {
            setMessages((current) =>
              current.map((message) => (message.id === aiMessage.id ? { ...message, content: message.content + payload.chunk } : message)),
            )
          }
          if (payload.type === "error") {
            streamError = payload.error || "The AI could not generate a document-grounded answer."
          }
        }
      }

      if (streamError) throw new Error(streamError)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to answer from the uploaded documents."
      if (message.includes("401") || message.includes("NVIDIA_API_KEY") || message.includes("Unauthorized")) {
        setShowKeyInput(true)
      }
      setError(message)
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          type: "ai",
          content: `I couldn't complete a document-grounded answer: ${message}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
  }

  const canAsk = Boolean(largeUpload) || (hasDocuments ?? Boolean(getDocuments || documents.length > 0))

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Document AI Assistant
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">RAG enabled — answers are restricted to your uploaded documents.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showKeyInput ? "secondary" : "outline"}
              size="sm"
              className="text-xs flex items-center gap-1"
              onClick={() => setShowKeyInput(!showKeyInput)}
            >
              <Key className="h-3.5 w-3.5 text-purple-500" />
              <span>{apiKey ? "API Key Set" : "Configure API Key"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={clearChat}>
              Clear
            </Button>
          </div>
        </div>

        {/* Inline API Key Configuration Card */}
        {showKeyInput && (
          <div className="mt-3 p-4 rounded-2xl border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 space-y-2.5 animate-in fade-in-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-purple-600" />
                NVIDIA API Key Configuration
              </span>
              {apiKey && (
                <span className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved locally
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If your API key returns 401 Unauthorized, get a free active key from{" "}
              <a
                href="https://build.nvidia.com/"
                target="_blank"
                rel="noreferrer"
                className="text-purple-600 dark:text-purple-400 underline font-medium inline-flex items-center gap-0.5"
              >
                build.nvidia.com <ExternalLink className="h-2.5 w-2.5" />
              </a>{" "}
              and paste it below.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="password"
                placeholder="nvapi-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 text-xs font-mono flex-1"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => saveCustomKey(apiKey)}>
                  Save Key
                </Button>
                {apiKey && (
                  <Button size="sm" variant="ghost" className="h-9 text-xs text-muted-foreground hover:text-destructive" onClick={clearCustomKey}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {indexStatus && <Badge variant="secondary" className="mt-3 w-fit font-normal">{indexStatus}</Badge>}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col p-0">
        <div className="mx-4 mt-1 rounded-md border border-dashed p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Large-document upload</p>
              <p className="text-xs text-muted-foreground">Upload up to 500 MB total. Files are streamed and indexed in batches.</p>
            </div>
            <div className="flex items-center gap-2">
              <input ref={uploadInputRef} type="file" multiple className="hidden" onChange={handleUploadChange} />
              <Button size="sm" variant="outline" disabled={isUploading} onClick={() => uploadInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Server Files
              </Button>
            </div>
          </div>

          {uploadProgress !== null && (
            <div className="mt-2 text-xs text-muted-foreground">Uploading: {uploadProgress}%</div>
          )}

          {largeUpload && (
            <div className="mt-2 text-xs text-muted-foreground">
              Ready: {largeUpload.fileCount} files ({formatBytes(largeUpload.totalBytes)})
            </div>
          )}
        </div>

        {error && (
          <div className="m-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-4 max-h-[380px]">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground py-10">
              <Bot className="mb-2 h-10 w-10 opacity-50" />
              <p className="text-sm font-medium">Ask questions about your uploaded documents</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                The AI only uses verified document excerpts to answer your questions.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                {message.type === "ai" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-sm ${
                    message.type === "user"
                      ? "bg-purple-600 text-white"
                      : "bg-muted/80 text-foreground border border-border/50"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 border-t border-border/40 pt-2 text-xs opacity-90">
                      <p className="font-semibold mb-1">Retrieved sources:</p>
                      <div className="space-y-0.5">
                        {message.sources.map((source, index) => (
                          <p key={`${source.documentId}-${source.chunk}`}>
                            [S{index + 1}] {source.name}, chunk {source.chunk}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {message.type === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t p-3.5 flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              canAsk
                ? "Ask a question about your documents…"
                : "Upload documents above before asking questions"
            }
            disabled={!canAsk || isLoading}
            className="flex-1 text-xs sm:text-sm h-10 rounded-xl"
          />
          <Button type="submit" size="sm" disabled={!canAsk || isLoading || !inputValue.trim()} className="h-10 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
