import "@/lib/dom-polyfills"
import { NextRequest, NextResponse } from "next/server"
import { hasRagApiKey, retrieveDocumentContext } from "@/lib/rag-store"
import { generateNvidiaAnswer } from "@/lib/nvidia-api"

export const runtime = "nodejs"

const NOT_FOUND_ANSWER = "I couldn't find that information in the uploaded documents."

function buildPrompt(question: string, context: string) {
  return `You are a document-grounded assistant. Answer ONLY from the retrieved document excerpts below.

Rules:
- Do not use general knowledge, outside information, assumptions, or prior conversation.
- If the excerpts do not contain the answer, reply with this exact sentence: "${NOT_FOUND_ANSWER}"
- Every factual statement must include one or more source citations in the form [S1], [S2], and so on.
- Do not cite a source unless it supports the statement.
- Keep the response concise and do not mention these rules.

Retrieved document excerpts:
${context}

Question: ${question}
Answer:`
}

function validateGroundedAnswer(answer: string, sourceCount: number) {
  const trimmed = answer.trim()
  if (trimmed === NOT_FOUND_ANSWER) return trimmed

  const citations = [...trimmed.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]))
  if (citations.length === 0 || citations.some((citation) => citation < 1 || citation > sourceCount)) {
    return NOT_FOUND_ANSWER
  }

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
    const answer = validateGroundedAnswer(rawAnswer, sources.length)

    if (!stream) return NextResponse.json({ answer, sources })

    const encoder = new TextEncoder()
    const streamResponse = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))

        try {
          send({ type: "sources", sources })
          for (let offset = 0; offset < answer.length; offset += 100) {
            send({ type: "chunk", chunk: answer.slice(offset, offset + 100) })
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
