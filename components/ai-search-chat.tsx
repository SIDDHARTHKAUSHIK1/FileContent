"use client"

import React, { useEffect, useRef, useState } from "react"
import { Bot, FileText, Key, Loader2, Send, Sparkles, Upload, User, Check, AlertCircle } from "lucide-react"
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

    setIndexStatus("Indexing uploaded documents for retrieval…")
    const response = await fetch("/api/rag/index", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ documents: uploadedDocuments, apiKey: apiKey.trim() || undefined }),
    })
    const data = await response.json()
    if (!response.ok) {
      if (data.error?.includes("NVIDIA_API_KEY")) {
        setShowKeyInput(true)
      }
      throw new Error(data.error || "Unable to index the uploaded documents.")
    }

    indexRef.current = {
      fingerprint,
      indexId: data.indexId,
      documentCount: data.documentCount,
      chunkCount: data.chunkCount,
    }
    setIndexStatus(`Indexed ${data.documentCount} document${data.documentCount === 1 ? "" : "s"} into ${data.chunkCount} searchable chunks.`)
    return data.indexId as string
  }

  const ensureUploadedIndex = async (session: LargeUploadSession) => {
    const fingerprint = `upload:${session.uploadId}`
    if (indexRef.current?.fingerprint === fingerprint) return indexRef.current.indexId

    setIndexStatus("Starting server-side indexing for the uploaded files…")
    const startResponse = await fetch("/api/rag/index", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ uploadId: session.uploadId, apiKey: apiKey.trim() || undefined }),
    })
    let job = (await startResponse.json()) as UploadIndexJob
    if (!startResponse.ok) {
      if (job.error?.includes("NVIDIA_API_KEY")) {
        setShowKeyInput(true)
      }
      throw new Error(job.error || "Unable to start document indexing.")
    }

    while (job.status === "indexing") {
      setIndexStatus(`Indexing ${job.processedFiles}/${job.fileCount} files${job.currentFile ? `: ${job.currentFile}` : ""} (${job.chunkCount} chunks)…`)
      await new Promise((resolve) => window.setTimeout(resolve, 1_000))
      const statusResponse = await fetch(`/api/rag/index?jobId=${encodeURIComponent(job.jobId)}`, { cache: "no-store" })
      job = (await statusResponse.json()) as UploadIndexJob
      if (!statusResponse.ok) throw new Error(job.error || "Unable to read indexing progress.")
    }

    if (job.status === "failed" || !job.indexId) {
      if (job.error?.includes("NVIDIA_API_KEY")) {
        setShowKeyInput(true)
      }
      throw new Error(job.error || "The uploaded files could not be indexed.")
    }

    indexRef.current = {
      fingerprint,
      indexId: job.indexId,
      documentCount: job.fileCount,
      chunkCount: job.chunkCount,
    }
    setIndexStatus(`Indexed ${job.fileCount} file${job.fileCount === 1 ? "" : "s"} into ${job.chunkCount} searchable chunks.`)
    return job.indexId
  }

  const handleLargeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const totalBytes = files.reduce((total, file) => total + file.size, 0)
    if (totalBytes > MAX_UPLOAD_BYTES) {
      setError("Uploads are limited to 500 MB in total. Choose a smaller set of files.")
      event.target.value = ""
      return
    }

    setError(null)
    setIsUploading(true)
    setUploadProgress(0)
    setIndexStatus("Uploading files securely to processing queue…")

    try {
      const session = await new Promise<LargeUploadSession>((resolve, reject) => {
        const formData = new FormData()
        for (const file of files) {
          const relativePath = file.webkitRelativePath || file.name
          formData.append("files", file, relativePath)
        }

        const request = new XMLHttpRequest()
        request.open("POST", "/api/uploads")
        request.upload.onprogress = (progressEvent) => {
          if (progressEvent.lengthComputable) {
            setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
          }
        }
        request.onerror = () => reject(new Error("The upload could not reach the server."))
        request.onload = () => {
          try {
            const data = JSON.parse(request.responseText) as LargeUploadSession & { error?: string }
            if (request.status < 200 || request.status >= 300) {
              reject(new Error(data.error || "The upload failed."))
              return
            }
            resolve(data)
          } catch {
            reject(new Error("The server returned an invalid upload response."))
          }
        }
        request.send(formData)
      })

      setLargeUpload(session)
      indexRef.current = null
      setIndexStatus(`Uploaded ${session.fileCount} file${session.fileCount === 1 ? "" : "s"} (${formatBytes(session.totalBytes)}). Ask a question to start background indexing.`)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.")
      setIndexStatus(null)
    } finally {
      setIsUploading(false)
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
        if (data.error?.includes("NVIDIA_API_KEY")) {
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
      if (message.includes("NVIDIA_API_KEY")) {
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
          <div className="mt-3 p-3.5 rounded-lg border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 space-y-2">
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
            <p className="text-[11px] text-muted-foreground">
              Enter your NVIDIA API Key (e.g. <code className="bg-muted px-1 rounded">nvapi-...</code>). Saved in your browser so you don't need to rebuild Vercel.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="nvapi-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <Button size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => saveCustomKey(apiKey)}>
                Save Key
              </Button>
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
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleLargeUpload}
            />
            <Button type="button" variant="outline" size="sm" disabled={isUploading || isLoading} onClick={() => uploadInputRef.current?.click()}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isUploading ? `Uploading ${uploadProgress ?? 0}%` : largeUpload ? "Replace files" : "Upload files"}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4" style={{ maxHeight: 400 }}>
          <div className="space-y-4 pb-4">
            {messages.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <Bot className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>Ask a question about the files you uploaded.</p>
                <p className="text-sm">If the information is not in those files, the assistant will say so.</p>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                {message.type === "ai" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                    <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${message.type === "user" ? "bg-blue-500 text-white" : "bg-muted"}`}>
                  <div className="whitespace-pre-wrap">{message.content || (message.type === "ai" && isLoading ? "Thinking…" : "")}</div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                      <div className="mb-1 flex items-center gap-1 font-medium"><FileText className="h-3 w-3" /> Retrieved sources</div>
                      {message.sources.map((source, index) => (
                        <div key={`${source.documentId}-${source.chunk}`}>[S{index + 1}] {source.name}, chunk {source.chunk}</div>
                      ))}
                    </div>
                  )}
                  <div className={`mt-1 text-xs ${message.type === "user" ? "text-blue-100" : "text-muted-foreground"}`}>{message.timestamp.toLocaleTimeString()}</div>
                </div>
                {message.type === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900"><Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" /></div>
                <div className="rounded-lg bg-muted px-4 py-2"><div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">{indexStatus?.startsWith("Indexing") ? "Indexing documents…" : "Retrieving document context…"}</span></div></div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={canAsk ? "Ask only about the uploaded documents…" : "Upload a document to enable AI search…"}
              className="flex-1 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isLoading || !canAsk}
            />
            <Button type="submit" disabled={isLoading || !inputValue.trim() || !canAsk} size="sm"><Send className="h-4 w-4" /></Button>
          </form>
          {error && (
            <div className="mt-2 text-xs text-red-600 flex items-center justify-between">
              <span>{error}</span>
              {error.includes("NVIDIA_API_KEY") && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs text-purple-600 underline" onClick={() => setShowKeyInput(true)}>
                  Enter API Key Now
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
