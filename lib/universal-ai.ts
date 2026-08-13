import type { RagDocumentInput, RagSource } from "@/lib/rag-types"

export type AiProvider = "gemini" | "nvidia" | "openai" | "groq" | "unknown"

export function detectKeyProvider(key?: string): AiProvider {
  if (!key) return "unknown"
  const clean = key.trim()
  if (clean.startsWith("AIzaSy")) return "gemini"
  if (clean.startsWith("nvapi-")) return "nvidia"
  if (clean.startsWith("gsk_")) return "groq"
  if (clean.startsWith("sk-")) return "openai"
  // Default to gemini if it looks like a Google key or other key
  if (clean.length === 39) return "gemini"
  return "gemini"
}

export function getEffectiveKey(keyOverride?: string): { key: string; provider: AiProvider } {
  const directKey = keyOverride?.trim()
  if (directKey) {
    return { key: directKey, provider: detectKeyProvider(directKey) }
  }

  // Check environment variables
  if (process.env.GEMINI_API_KEY) {
    return { key: process.env.GEMINI_API_KEY.trim(), provider: "gemini" }
  }
  if (process.env.NVIDIA_API_KEY) {
    return { key: process.env.NVIDIA_API_KEY.trim(), provider: "nvidia" }
  }
  if (process.env.GROQ_API_KEY) {
    return { key: process.env.GROQ_API_KEY.trim(), provider: "groq" }
  }
  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY.trim(), provider: "openai" }
  }

  return { key: "", provider: "unknown" }
}

/**
 * Intelligent client/server relevance ranking to extract the most relevant document sections
 * for answering a question. This keeps payloads under 50KB and completely prevents HTTP 413 errors.
 */
export function extractRelevantExcerpts(
  documents: RagDocumentInput[],
  query: string,
  maxTotalChars = 60_000
): { context: string; sources: RagSource[] } {
  if (!documents || documents.length === 0) {
    return { context: "No documents uploaded.", sources: [] }
  }

  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)

  type ScoredPassage = {
    documentId: string
    documentName: string
    sourceTitle: string
    content: string
    score: number
  }

  const passages: ScoredPassage[] = []

  for (const doc of documents) {
    const docName = doc.name || "Document"
    const text = doc.content || ""

    // Split document into natural chunks (~1000 characters or lines)
    const rawChunks = text.split(/\n{2,}|\n(?=[A-Z0-9\s-]{3,}:)/).filter(Boolean)
    const chunks: string[] = []

    for (const raw of rawChunks) {
      if (raw.length > 2500) {
        for (let i = 0; i < raw.length; i += 2000) {
          chunks.push(raw.slice(i, i + 2000))
        }
      } else if (raw.trim().length > 20) {
        chunks.push(raw.trim())
      }
    }

    if (chunks.length === 0 && text.trim()) {
      chunks.push(text.slice(0, 3000))
    }

    chunks.forEach((chunk, chunkIdx) => {
      const lowerChunk = chunk.toLowerCase()
      let score = 0

      // Exact phrase bonus
      if (query.trim().length > 3 && lowerChunk.includes(query.toLowerCase().trim())) {
        score += 150
      }

      // Keyword term matching
      for (const term of queryTerms) {
        const count = (lowerChunk.match(new RegExp(`\\b${escapeRegExp(term)}`, "g")) || []).length
        score += count * 20
      }

      // Density bonus
      if (queryTerms.length > 1) {
        const termsPresent = queryTerms.filter((t) => lowerChunk.includes(t)).length
        if (termsPresent === queryTerms.length) {
          score += 60
        }
      }

      passages.push({
        documentId: doc.id || docName,
        documentName: docName,
        sourceTitle: `${docName} (Section ${chunkIdx + 1})`,
        content: chunk,
        score: score,
      })
    })
  }

  // Sort passages by score descending; if all 0, take first passages from each document
  passages.sort((a, b) => b.score - a.score)

  const selectedPassages: ScoredPassage[] = []
  let totalChars = 0

  for (const p of passages) {
    if (totalChars + p.content.length > maxTotalChars) break
    selectedPassages.push(p)
    totalChars += p.content.length
  }

  // If no passages scored above 0, ensure we take at least initial excerpts from each document
  if (selectedPassages.length === 0 || selectedPassages.every((p) => p.score === 0)) {
    const fallbackPassages: ScoredPassage[] = []
    let fbChars = 0
    for (const doc of documents) {
      if (fbChars > maxTotalChars) break
      const excerpt = doc.content.slice(0, 3000)
      fallbackPassages.push({
        documentId: doc.id || doc.name,
        documentName: doc.name,
        sourceTitle: doc.name,
        content: excerpt,
        score: 1,
      })
      fbChars += excerpt.length
    }
    selectedPassages.splice(0, selectedPassages.length, ...fallbackPassages)
  }

  const sources: RagSource[] = selectedPassages.map((p, idx) => ({
    id: `S${idx + 1}`,
    documentId: p.documentId,
    name: p.documentName,
    path: p.sourceTitle,
    chunk: idx + 1,
    score: p.score,
    snippet: p.content.slice(0, 200).replace(/\s+/g, " ") + "...",
  }))

  const contextFormatted = selectedPassages
    .map((p, idx) => `[S${idx + 1}] Source: ${p.sourceTitle}\n${p.content}`)
    .join("\n\n---\n\n")

  return { context: contextFormatted, sources }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Executes a question-answering prompt across the detected AI provider.
 */
export async function executeAiQuery(
  prompt: string,
  apiKeyOverride?: string
): Promise<string> {
  const { key, provider } = getEffectiveKey(apiKeyOverride)

  if (!key) {
    throw new Error(
      "No AI API Key provided. Please enter your Google Gemini, NVIDIA, Groq, or OpenAI API key in settings."
    )
  }

  if (provider === "gemini") {
    return queryGoogleGemini(prompt, key)
  } else if (provider === "nvidia") {
    return queryNvidia(prompt, key)
  } else if (provider === "groq") {
    return queryGroq(prompt, key)
  } else if (provider === "openai") {
    return queryOpenAI(prompt, key)
  }

  return queryGoogleGemini(prompt, key)
}

async function queryGoogleGemini(prompt: string, apiKey: string): Promise<string> {
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
  let lastError = ""

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errMsg = errData.error?.message || `HTTP ${response.status}`
        if (response.status === 400 || response.status === 403 || response.status === 401) {
          throw new Error(`Google Gemini API Key error: ${errMsg}`)
        }
        lastError = errMsg
        continue
      }

      const data = await response.json()
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (answer && answer.trim()) {
        return answer.trim()
      }
    } catch (e: any) {
      if (e.message?.includes("Gemini API Key error")) throw e
      lastError = e.message
    }
  }

  throw new Error(`Google Gemini failed: ${lastError || "Empty response from Gemini."}`)
}

async function queryNvidia(prompt: string, apiKey: string): Promise<string> {
  const url = "https://integrate.api.nvidia.com/v1/chat/completions"
  const models = ["meta/llama-3.1-70b-instruct", "nvidia/nemotron-3-ultra-550b-a55b"]

  for (const model of models) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 2048,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Invalid or expired NVIDIA API Key (401 Unauthorized).")
        }
        continue
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      if (typeof content === "string" && content.trim()) return content.trim()
    } catch (e: any) {
      if (e.message?.includes("401")) throw e
    }
  }

  throw new Error("NVIDIA API returned an empty or invalid response.")
}

async function queryGroq(prompt: string, apiKey: string): Promise<string> {
  const url = "https://api.groq.com/openai/v1/chat/completions"
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq API request failed with status ${response.status}.`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || "No response generated."
}

async function queryOpenAI(prompt: string, apiKey: string): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions"
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API request failed with status ${response.status}.`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || "No response generated."
}
