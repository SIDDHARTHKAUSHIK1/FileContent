import "@/lib/dom-polyfills"
import { NextRequest, NextResponse } from "next/server"
import { hasRagApiKey, retrieveDocumentContext } from "@/lib/rag-store"
import { generateNvidiaAnswer } from "@/lib/nvidia-api"

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

function processAnswer(rawAnswer: string, sourceCount: number): string {
  const trimmed = rawAnswer.trim()
  if (!trimmed) return NOT_FOUND_ANSWER
  return trimmed
}

export async function POST(request: NextRequest) {
  try {
    const headerKey = request.headers.get("x-nvidia-api-key") || undefined
    const { question, indexId, stream = false, apiKey } = (await request.json()) as {
      question?: string
      indexId?: string
      stream?: boolean
      apiKey?: string
    }
    const effectiveApiKey = headerKey || apiKey

    if (!question?.trim()) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 })
    }

    if (!indexId) {
      return NextResponse.json({ error: "Upload and index documents before asking a question." }, { status: 400 })
    }

    if (!hasRagApiKey(effectiveApiKey)) {
      return NextResponse.json(
        { error: "NVIDIA_API_KEY is not set. Please add it in Vercel Project Settings or enter it in the AI settings." },
        { status: 500 },
      )
    }

    const { context, sources } = await retrieveDocumentContext(indexId, question.trim())
    const prompt = buildPrompt(question.trim(), context)
    const rawAnswer = await generateNvidiaAnswer(prompt, effectiveApiKey)
    const answer = processAnswer(rawAnswer, sources.length)

    if (!stream) return NextResponse.json({ answer, sources })

    const encoder = new TextEncoder()
    const streamResponse = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))

        try {
          send({ type: "sources", sources })
          for (let offset = 0; offset < answer.length; offset += 80) {
            send({ type: "chunk", chunk: answer.slice(offset, offset + 80) })
          }
        } catch (error) {
          console.error("RAG answer generation error:", error)
          send({ type: "error", error: "The AI could not generate a document-grounded answer. Please try again." })
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
  } catch (error) {
    console.error("RAG AI search error:", error)
    const message = error instanceof Error ? error.message : "Unable to answer from the uploaded documents."
    const status = error instanceof Error && error.name === "RagIndexNotFoundError" ? 410 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
