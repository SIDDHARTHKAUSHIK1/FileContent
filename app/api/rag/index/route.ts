import "@/lib/dom-polyfills"
import { NextRequest, NextResponse } from "next/server"
import { getUploadedIndexJob, indexDocuments, startUploadedIndex } from "@/lib/rag-store"
import type { RagDocumentInput } from "@/lib/rag-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const headerKey = request.headers.get("x-nvidia-api-key") || undefined
    const body = (await request.json()) as { documents?: RagDocumentInput[]; uploadId?: string; apiKey?: string }
    const effectiveApiKey = headerKey || body.apiKey

    if (body.uploadId) {
      const job = await startUploadedIndex(body.uploadId, effectiveApiKey)
      return NextResponse.json(job, { status: job.status === "complete" ? 200 : 202 })
    }
    const index = await indexDocuments(body.documents ?? [], effectiveApiKey)
    return NextResponse.json(index)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to index uploaded documents."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 })

  const job = getUploadedIndexJob(jobId)
  if (!job) return NextResponse.json({ error: "The indexing job is no longer available." }, { status: 404 })
  return NextResponse.json(job)
}
