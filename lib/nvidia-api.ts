import { Embeddings } from "@langchain/core/embeddings"

const NVIDIA_API_BASE_URL = (process.env.NVIDIA_API_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "")
const DEFAULT_CHAT_MODEL = "meta/llama-3.1-70b-instruct"
const FALLBACK_CHAT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
const DEFAULT_EMBEDDING_MODEL = "nvidia/nv-embedqa-e5-v5"

type NvidiaChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>
    }
  }>
}

type NvidiaEmbeddingResponse = {
  data?: Array<{ index: number; embedding: number[] }>
}

export function getNvidiaApiKey(overrideKey?: string): string | undefined {
  const cleanOverride = overrideKey?.trim()
  if (cleanOverride) return cleanOverride
  return process.env.NVIDIA_API_KEY || process.env.NEXT_PUBLIC_NVIDIA_API_KEY
}

export function hasNvidiaApiKey(overrideKey?: string): boolean {
  return Boolean(getNvidiaApiKey(overrideKey))
}

function authorizationHeaders(apiKeyOverride?: string) {
  const apiKey = getNvidiaApiKey(apiKeyOverride)
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not set. Add it in Vercel Project Settings -> Environment Variables or enter it in the app settings.")
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
}

async function nvidiaRequest<T>(path: string, body: Record<string, unknown>, apiKeyOverride?: string): Promise<T> {
  const response = await fetch(`${NVIDIA_API_BASE_URL}${path}`, {
    method: "POST",
    headers: authorizationHeaders(apiKeyOverride),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    console.error("NVIDIA API request failed", { path, status: response.status })
    throw new Error(`NVIDIA API request failed with status ${response.status}.`)
  }

  return response.json() as Promise<T>
}

export async function generateNvidiaAnswer(prompt: string, apiKeyOverride?: string): Promise<string> {
  const primaryModel = process.env.NVIDIA_CHAT_MODEL || DEFAULT_CHAT_MODEL

  try {
    const data = await nvidiaRequest<NvidiaChatResponse>(
      "/chat/completions",
      {
        model: primaryModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 2_048,
      },
      apiKeyOverride,
    )

    const content = data.choices?.[0]?.message?.content
    if (typeof content === "string" && content.trim()) return content.trim()
    if (Array.isArray(content)) {
      const text = content.map((part) => part.text || "").join("").trim()
      if (text) return text
    }
  } catch (primaryErr) {
    console.warn("Primary model failed, trying fallback model:", primaryErr)
    const fallbackData = await nvidiaRequest<NvidiaChatResponse>(
      "/chat/completions",
      {
        model: FALLBACK_CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 2_048,
      },
      apiKeyOverride,
    )

    const fallbackContent = fallbackData.choices?.[0]?.message?.content
    if (typeof fallbackContent === "string" && fallbackContent.trim()) return fallbackContent.trim()
    if (Array.isArray(fallbackContent)) {
      const text = fallbackContent.map((part) => part.text || "").join("").trim()
      if (text) return text
    }
  }

  throw new Error("NVIDIA returned an empty response.")
}

export class NvidiaEmbeddings extends Embeddings {
  private readonly model: string
  private readonly apiKey?: string

  constructor(fields?: { apiKey?: string }) {
    super({ maxConcurrency: 2, maxRetries: 2 })
    this.model = process.env.NVIDIA_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
    this.apiKey = fields?.apiKey
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const embeddings: number[][] = []
    const batchSize = 32

    for (let start = 0; start < documents.length; start += batchSize) {
      const batch = documents.slice(start, start + batchSize)
      const data = await nvidiaRequest<NvidiaEmbeddingResponse>(
        "/embeddings",
        {
          model: this.model,
          input: batch,
          input_type: "passage",
        },
        this.apiKey,
      )
      const orderedEmbeddings = (data.data || []).sort((left, right) => left.index - right.index).map((item) => item.embedding)
      if (orderedEmbeddings.length !== batch.length) {
        throw new Error("NVIDIA returned an incomplete embedding response.")
      }
      embeddings.push(...orderedEmbeddings)
    }

    return embeddings
  }

  async embedQuery(question: string): Promise<number[]> {
    const data = await nvidiaRequest<NvidiaEmbeddingResponse>(
      "/embeddings",
      {
        model: this.model,
        input: [question],
        input_type: "query",
      },
      this.apiKey,
    )
    const embedding = data.data?.[0]?.embedding
    if (!embedding) throw new Error("NVIDIA returned an empty query embedding.")
    return embedding
  }
}
