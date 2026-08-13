import "@/lib/dom-polyfills"
import { NextRequest, NextResponse } from "next/server"
import { executeAiQuery, extractRelevantExcerpts, getEffectiveKey } from "@/lib/universal-ai"
import { retrieveDocumentContext } from "@/lib/rag-store"
import type { RagDocumentInput, RagSource } from "@/lib/rag-types"

export const runtime = "nodejs"

const NOT_FOUND_ANSWER = "I couldn't find that information in the uploaded documents."

function buildPrompt(question: string, context: string) {
  return `You are a helpful and intelligent AI document assistant. Answer the user's question accurately using the provided document excerpts below.

Guidelines:
- Provide a clear, natural, and informative response directly answering the user's question.
- Reference the source excerpts using [S1], [S2] where relevant.
- If the question cannot be answered from the provided excerpts, politely say: "${NOT_FOUND_ANSWER}"

Document Excerpts:
${context}

User Question: ${question}
Answer:`
}

export async function POST(request: NextRequest) {
  try {
    const headerKey =
      request.headers.get("x-nvidia-api-key") ||
      request.headers.get("x-gemini-api-key") ||
      request.headers.get("x-api-key") ||
      undefined

    const body = (await request.json()) as {
      question?: string
      documents?: RagDocumentInput[]
      content?: string
      indexId?: string
      stream?: boolean
      apiKey?: string
    }

    const { question, documents, content, indexId, stream = false, apiKey } = body
    const effectiveApiKey = headerKey || apiKey

    if (!question?.trim()) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 })
    }

    const { key, provider } = getEffectiveKey(effectiveApiKey)
    if (!key) {
      return NextResponse.json(
        {
          error:
            "No AI API Key found. Please enter your Google Gemini API key (AIzaSy...) or NVIDIA/OpenAI key in the AI Assistant settings.",
        },
        { status: 401 }
      )
    }

    let context = ""
    let sources: RagSource[] = []

    // 1. Direct document excerpts (avoids 413 and stateless serverless index expiration)
    if (documents && Array.isArray(documents) && documents.length > 0) {
      const extracted = extractRelevantExcerpts(documents, question.trim())
      context = extracted.context
      sources = extracted.sources
    } else if (content && typeof content === "string" && content.trim()) {
      const singleDoc: RagDocumentInput[] = [
        { id: "doc-1", name: "Document Content", content: content },
      ]
      const extracted = extractRelevantExcerpts(singleDoc, question.trim())
      context = extracted.context
      sources = extracted.sources
    } else if (indexId) {
      try {
        const retrieved = await retrieveDocumentContext(indexId, question.trim())
        context = retrieved.context
        sources = retrieved.sources
      } catch (ragErr) {
        console.warn("RAG index retrieval fallback:", ragErr)
      }
    }

    if (!context.trim()) {
      context = "No specific document excerpts provided. Please answer based on general knowledge."
    }

    const prompt = buildPrompt(question.trim(), context)
    const rawAnswer = await executeAiQuery(prompt, effectiveApiKey)
    const answer = rawAnswer.trim() || NOT_FOUND_ANSWER

    if (!stream) {
      return NextResponse.json({ answer, sources, provider })
    }

    const encoder = new TextEncoder()
    const streamResponse = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))

        try {
          send({ type: "sources", sources, provider })
          // Stream chunks smoothly
          const chunkSize = 60
          for (let offset = 0; offset < answer.length; offset += chunkSize) {
            send({ type: "chunk", chunk: answer.slice(offset, offset + chunkSize) })
          }
        } catch (error) {
          console.error("AI answer streaming error:", error)
          send({
            type: "error",
            error: "The AI could not generate a document-grounded answer. Please try again.",
          })
        } finally {
          send({ type: "done" })
          controller.close()
        }
      },
    })

    return new Response(streamResponse, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error: any) {
    console.error("AI search route error:", error)
    const message =
      error instanceof Error ? error.message : "Unable to generate answer from the documents."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
