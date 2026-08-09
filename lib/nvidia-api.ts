import { Embeddings } from "@langchain/core/embeddings"

const NVIDIA_API_BASE_URL = (process.env.NVIDIA_API_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "")
const DEFAULT_CHAT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
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

export function getNvidiaApiKey(): string | undefined {
  return process.env.NVIDIA_API_KEY
}

export function hasNvidiaApiKey(): boolean {
  return Boolean(getNvidiaApiKey())
}

function authorizationHeaders() {
  const apiKey = getNvidiaApiKey()
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set. Add it to .env.local before using document AI search.")

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
}

async function nvidiaRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${NVIDIA_API_BASE_URL}${path}`, {
    method: "POST",
    headers: authorizationHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    console.error("NVIDIA API request failed", { path, status: response.status })
    throw new Error(`NVIDIA API request failed with status ${response.status}.`)
  }

  return response.json() as Promise<T>
}

export async function generateNvidiaAnswer(prompt: string): Promise<string> {
  const data = await nvidiaRequest<NvidiaChatResponse>("/chat/completions", {
    model: process.env.NVIDIA_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    top_p: 0.95,
    max_tokens: 2_048,
    chat_template_kwargs: { enable_thinking: false },
  })

  const content = data.choices?.[0]?.message?.content
  if (typeof content === "string" && content.trim()) return content
  if (Array.isArray(content)) {
    const text = content.map((part) => part.text || "").join("").trim()
    if (text) return text
  }

  throw new Error("NVIDIA returned an empty response.")
}

export class NvidiaEmbeddings extends Embeddings {
  private readonly model: string

  constructor() {
    super({ maxConcurrency: 2, maxRetries: 2 })
    this.model = process.env.NVIDIA_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const embeddings: number[][] = []
    const batchSize = 32

    for (let start = 0; start < documents.length; start += batchSize) {
      const batch = documents.slice(start, start + batchSize)
      const data = await nvidiaRequest<NvidiaEmbeddingResponse>("/embeddings", {
        model: this.model,
        input: batch,
        input_type: "passage",
      })
      const orderedEmbeddings = (data.data || []).sort((left, right) => left.index - right.index).map((item) => item.embedding)
      if (orderedEmbeddings.length !== batch.length) {
        throw new Error("NVIDIA returned an incomplete embedding response.")
      }
      embeddings.push(...orderedEmbeddings)
    }

    return embeddings
  }

  async embedQuery(question: string): Promise<number[]> {
    const data = await nvidiaRequest<NvidiaEmbeddingResponse>("/embeddings", {
      model: this.model,
      input: [question],
      input_type: "query",
    })
    const embedding = data.data?.[0]?.embedding
    if (!embedding) throw new Error("NVIDIA returned an empty query embedding.")
    return embedding
  }
}
