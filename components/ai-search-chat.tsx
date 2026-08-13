"use client"

import React, { useEffect, useRef, useState } from "react"
import {
  Bot,
  FileText,
  Key,
  Loader2,
  Send,
  Sparkles,
  Upload,
  User,
  Check,
  AlertCircle,
  ExternalLink,
  RotateCcw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { RagDocumentInput, RagSource } from "@/lib/rag-types"
import { detectKeyProvider, extractRelevantExcerpts, type AiProvider } from "@/lib/universal-ai"

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  sources?: RagSource[]
  provider?: string
}

interface AISearchChatProps {
  documents?: RagDocumentInput[]
  getDocuments?: () => Promise<RagDocumentInput[]>
  hasDocuments?: boolean
  fileContent?: string
}

export default function AISearchChat({
  documents = [],
  getDocuments,
  hasDocuments,
  fileContent,
}: AISearchChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Custom API key management (stored in localStorage for Vercel/client-side users)
  const [apiKey, setApiKey] = useState("")
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved =
        localStorage.getItem("ai_api_key") ||
        localStorage.getItem("gemini_api_key") ||
        localStorage.getItem("nvidia_api_key") ||
        ""
      if (saved) setApiKey(saved)
    }
  }, [])

  const detectedProvider: AiProvider = detectKeyProvider(apiKey)

  const saveCustomKey = (key: string) => {
    const clean = key.trim()
    setApiKey(clean)
    if (typeof window !== "undefined") {
      if (clean) {
        localStorage.setItem("ai_api_key", clean)
        localStorage.setItem("gemini_api_key", clean)
        localStorage.setItem("nvidia_api_key", clean)
      } else {
        localStorage.removeItem("ai_api_key")
        localStorage.removeItem("gemini_api_key")
        localStorage.removeItem("nvidia_api_key")
      }
    }
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2500)
    setShowKeyInput(false)
    setError(null)
  }

  const clearCustomKey = () => {
    setApiKey("")
    if (typeof window !== "undefined") {
      localStorage.removeItem("ai_api_key")
      localStorage.removeItem("gemini_api_key")
      localStorage.removeItem("nvidia_api_key")
    }
    setError(null)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const activeKey =
      apiKey.trim() ||
      (typeof window !== "undefined"
        ? localStorage.getItem("ai_api_key") ||
          localStorage.getItem("gemini_api_key") ||
          localStorage.getItem("nvidia_api_key") ||
          ""
        : "")
    if (activeKey) {
      headers["x-api-key"] = activeKey
      headers["x-gemini-api-key"] = activeKey
      headers["x-nvidia-api-key"] = activeKey
    }
    return headers
  }

  const loadDocuments = async (): Promise<RagDocumentInput[]> => {
    if (fileContent && typeof fileContent === "string" && fileContent.trim()) {
      return [{ id: "doc-legacy", name: "Uploaded Files", content: fileContent }]
    }
    const loadedDocuments = getDocuments ? await getDocuments() : documents
    return loadedDocuments.filter((document) => document.content && document.content.trim().length > 0)
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
    setIndexStatus("Scanning document context…")

    try {
      const loadedDocs = await loadDocuments()
      if (loadedDocs.length === 0) {
        throw new Error("Please upload a readable document or folder first before asking the AI.")
      }

      // Pre-extract relevant excerpts on client side.
      // This guarantees payload size is < 50 KB, completely preventing HTTP 413 errors!
      const { context, sources } = extractRelevantExcerpts(loadedDocs, question)
      setIndexStatus("Generating AI response…")

      const activeKey =
        apiKey.trim() ||
        (typeof window !== "undefined"
          ? localStorage.getItem("ai_api_key") ||
            localStorage.getItem("gemini_api_key") ||
            localStorage.getItem("nvidia_api_key") ||
            ""
          : "")

      const response = await fetch("/api/ai-search", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          question,
          content: context,
          stream: true,
          apiKey: activeKey || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        if (
          data.error?.includes("401") ||
          data.error?.includes("API key") ||
          data.error?.includes("API_KEY") ||
          data.error?.includes("Unauthorized")
        ) {
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
        sources: sources,
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
          try {
            const payload = JSON.parse(line.slice(6)) as {
              type?: string
              chunk?: string
              sources?: RagSource[]
              error?: string
              provider?: string
            }

            if (payload.type === "sources" && payload.sources) {
              setMessages((current) =>
                current.map((msg) =>
                  msg.id === aiMessage.id
                    ? { ...msg, sources: payload.sources || sources, provider: payload.provider }
                    : msg
                )
              )
            }
            if (payload.type === "chunk" && payload.chunk) {
              setMessages((current) =>
                current.map((msg) =>
                  msg.id === aiMessage.id ? { ...msg, content: msg.content + payload.chunk } : msg
                )
              )
            }
            if (payload.type === "error") {
              streamError = payload.error || "The AI could not generate an answer."
            }
          } catch (jsonErr) {
            console.warn("Error parsing stream chunk:", jsonErr)
          }
        }
      }

      if (streamError) throw new Error(streamError)
    } catch (caughtError: any) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to answer from documents."
      if (
        message.includes("401") ||
        message.includes("API key") ||
        message.includes("API_KEY") ||
        message.includes("Unauthorized")
      ) {
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
      setIndexStatus(null)
    }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
  }

  const canAsk = Boolean(fileContent) || (hasDocuments ?? Boolean(getDocuments || documents.length > 0))

  const getProviderBadge = () => {
    switch (detectedProvider) {
      case "gemini":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px]">Google Gemini</Badge>
      case "nvidia":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-[10px]">NVIDIA AI</Badge>
      case "openai":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px]">OpenAI</Badge>
      case "groq":
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 text-[10px]">Groq</Badge>
      default:
        return null
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Document AI Assistant
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Universal AI search — answers are grounded in your uploaded documents.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showKeyInput ? "secondary" : "outline"}
              size="sm"
              className="text-xs flex items-center gap-1.5"
              onClick={() => setShowKeyInput(!showKeyInput)}
            >
              <Key className="h-3.5 w-3.5 text-purple-500" />
              <span>{apiKey ? "API Key Configured" : "Set API Key"}</span>
              {apiKey && getProviderBadge()}
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
                Universal AI API Key Configuration
              </span>
              <div className="flex items-center gap-2">
                {apiKey && getProviderBadge()}
                {apiKey && (
                  <span className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Saved
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Enter your <strong>Google Gemini API Key</strong> (starts with <code>AIzaSy...</code>) or <strong>NVIDIA / OpenAI / Groq</strong> key.
              Get a 100% free Gemini API key from{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-purple-600 dark:text-purple-400 underline font-medium inline-flex items-center gap-0.5"
              >
                Google AI Studio <ExternalLink className="h-2.5 w-2.5" />
              </a>{" "}
              or NVIDIA key from{" "}
              <a
                href="https://build.nvidia.com/"
                target="_blank"
                rel="noreferrer"
                className="text-purple-600 dark:text-purple-400 underline font-medium inline-flex items-center gap-0.5"
              >
                build.nvidia.com <ExternalLink className="h-2.5 w-2.5" />
              </a>.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="password"
                placeholder="Paste Gemini (AIzaSy...), NVIDIA (nvapi-...), or OpenAI (sk-...) key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 text-xs font-mono flex-1"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => saveCustomKey(apiKey)}
                >
                  Save Key
                </Button>
                {apiKey && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs text-muted-foreground hover:text-destructive"
                    onClick={clearCustomKey}
                  >
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
        {error && (
          <div className="m-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-4 max-h-[420px]">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground py-10">
              <Bot className="mb-2 h-10 w-10 opacity-50" />
              <p className="text-sm font-medium">Ask questions about your uploaded documents</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                The AI searches across all uploaded files and provides document-grounded answers.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.type === "user" ? "justify-end" : "justify-start"}`}
              >
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
                      <p className="font-semibold mb-1">Referenced document sources:</p>
                      <div className="space-y-1">
                        {message.sources.map((source, index) => (
                          <div key={index} className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">[{source.id || `S${index + 1}`}]</span>{" "}
                            {source.name}
                          </div>
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
                ? "Ask a question about your uploaded documents…"
                : "Upload files or folders above before asking questions"
            }
            disabled={!canAsk || isLoading}
            className="flex-1 text-xs sm:text-sm h-10 rounded-xl"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canAsk || isLoading || !inputValue.trim()}
            className="h-10 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
