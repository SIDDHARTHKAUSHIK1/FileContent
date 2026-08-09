import { Document } from "@langchain/core/documents"
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { randomUUID } from "crypto"
import { createReadStream } from "fs"
import { readFile } from "fs/promises"
import path from "path"
import mammoth from "mammoth"
import JSZip from "jszip"
import { parseStringPromise } from "xml2js"
import * as XLSX from "xlsx"
import type { RagDocumentInput, RagSource } from "@/lib/rag-types"
import { hasNvidiaApiKey, NvidiaEmbeddings } from "@/lib/nvidia-api"
import { getStoredFilePath, getUploadSession, type StoredUploadFile, type UploadSession } from "@/lib/upload-store"

const MAX_DOCUMENTS = 100
const MAX_CHARACTERS_PER_DOCUMENT = 250_000
const MAX_TOTAL_CHARACTERS = 1_000_000
const INDEX_TTL_MS = 30 * 60 * 1000
const STREAM_CHUNK_SIZE = 6_000
const STREAM_CHUNK_OVERLAP = 400
const EMBEDDING_BATCH_SIZE = 32

type IndexedCorpus = {
  vectorStore: MemoryVectorStore
  documentCount: number
  chunkCount: number
  createdAt: number
}

export type RagIndexJob = {
  jobId: string
  uploadId: string
  status: "indexing" | "complete" | "failed"
  totalBytes: number
  processedBytes: number
  fileCount: number
  processedFiles: number
  currentFile?: string
  chunkCount: number
  indexId?: string
  error?: string
  createdAt: number
}

type GlobalRagStore = {
  corpora: Map<string, IndexedCorpus>
  indexingJobs: Map<string, RagIndexJob>
  uploadJobs: Map<string, string>
}

const globalForRag = globalThis as unknown as {
  __ragStore?: GlobalRagStore
}

if (!globalForRag.__ragStore) {
  globalForRag.__ragStore = {
    corpora: new Map<string, IndexedCorpus>(),
    indexingJobs: new Map<string, RagIndexJob>(),
    uploadJobs: new Map<string, string>(),
  }
}

const { corpora, indexingJobs, uploadJobs } = globalForRag.__ragStore

export function hasRagApiKey(overrideKey?: string): boolean {
  return hasNvidiaApiKey(overrideKey)
}

function removeExpiredCorpora() {
  const expiresBefore = Date.now() - INDEX_TTL_MS
  for (const [indexId, corpus] of corpora) {
    if (corpus.createdAt < expiresBefore) {
      corpora.delete(indexId)
    }
  }

  for (const [jobId, job] of indexingJobs) {
    if (job.status !== "indexing" && job.createdAt < expiresBefore) {
      indexingJobs.delete(jobId)
      uploadJobs.delete(job.uploadId)
    }
  }
}

function prepareDocuments(documents: RagDocumentInput[]) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error("Upload at least one document before asking the AI.")
  }

  if (documents.length > MAX_DOCUMENTS) {
    throw new Error(`A maximum of ${MAX_DOCUMENTS} documents can be indexed at once.`)
  }

  let totalCharacters = 0
  const prepared = documents.flatMap((document) => {
    const content = typeof document.content === "string" ? document.content.trim() : ""
    if (!content) return []

    if (content.length > MAX_CHARACTERS_PER_DOCUMENT) {
      throw new Error(`\"${document.name || "Unnamed document"}\" is too large to index. Limit each document to ${MAX_CHARACTERS_PER_DOCUMENT.toLocaleString()} characters.`)
    }

    totalCharacters += content.length
    return [
      new Document({
        pageContent: content,
        metadata: {
          documentId: String(document.id || document.name),
          name: String(document.name || "Unnamed document"),
          path: document.path ? String(document.path) : "",
        },
      }),
    ]
  })

  if (totalCharacters > MAX_TOTAL_CHARACTERS) {
    throw new Error(`The uploaded documents are too large to index together. Limit the total to ${MAX_TOTAL_CHARACTERS.toLocaleString()} characters.`)
  }

  if (prepared.length === 0) {
    throw new Error("The uploaded documents do not contain readable text.")
  }

  return prepared
}

export async function indexDocuments(documents: RagDocumentInput[], apiKeyOverride?: string) {
  if (!hasRagApiKey(apiKeyOverride)) {
    throw new Error("NVIDIA_API_KEY is not set. Add it in Vercel Project Settings or enter it in the AI search settings.")
  }

  removeExpiredCorpora()
  const sourceDocuments = prepareDocuments(documents)
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1_200,
    chunkOverlap: 200,
  })
  const chunks = await splitter.splitDocuments(sourceDocuments)

  chunks.forEach((chunk, index) => {
    chunk.metadata.chunk = index + 1
  })

  const embeddings = new NvidiaEmbeddings({ apiKey: apiKeyOverride })
  const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings)
  const indexId = randomUUID()

  corpora.set(indexId, {
    vectorStore,
    documentCount: sourceDocuments.length,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  })

  return {
    indexId,
    documentCount: sourceDocuments.length,
    chunkCount: chunks.length,
  }
}

function isStreamableTextFile(file: StoredUploadFile) {
  return new Set([
    ".txt", ".md", ".csv", ".tsv", ".html", ".htm", ".json", ".xml", ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".css", ".sql", ".log", ".yaml", ".yml",
  ]).has(path.extname(file.name).toLowerCase())
}

function chooseSplitPoint(text: string) {
  const searchStart = Math.max(0, text.length - 1_000)
  const candidates = [text.lastIndexOf("\n\n"), text.lastIndexOf("\n"), text.lastIndexOf(". "), text.lastIndexOf(" ")]
  return candidates.find((index) => index >= searchStart) ?? text.length
}

async function* streamTextChunks(filePath: string) {
  let buffer = ""
  for await (const data of createReadStream(filePath, { encoding: "utf8", highWaterMark: 256 * 1024 })) {
    buffer += data
    while (buffer.length >= STREAM_CHUNK_SIZE) {
      const splitPoint = chooseSplitPoint(buffer.slice(0, STREAM_CHUNK_SIZE))
      const chunk = buffer.slice(0, splitPoint).trim()
      if (chunk) yield chunk
      buffer = buffer.slice(Math.max(0, splitPoint - STREAM_CHUNK_OVERLAP))
    }
  }
  if (buffer.trim()) yield buffer.trim()
}

function ensureNodeDomPolyfills() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    // @ts-ignore
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true;
      isIdentity = true;
      constructor(init?: any) {
        if (Array.isArray(init) || (init && typeof init.length === "number")) {
          if (init.length === 6) {
            this.a = this.m11 = init[0];
            this.b = this.m12 = init[1];
            this.c = this.m21 = init[2];
            this.d = this.m22 = init[3];
            this.e = this.m41 = init[4];
            this.f = this.m42 = init[5];
          } else if (init.length === 16) {
            this.m11 = init[0]; this.m12 = init[1]; this.m13 = init[2]; this.m14 = init[3];
            this.m21 = init[4]; this.m22 = init[5]; this.m23 = init[6]; this.m24 = init[7];
            this.m31 = init[8]; this.m32 = init[9]; this.m33 = init[10]; this.m34 = init[11];
            this.m41 = init[12]; this.m42 = init[13]; this.m43 = init[14]; this.m44 = init[15];
            this.a = this.m11; this.b = this.m12; this.c = this.m21; this.d = this.m22; this.e = this.m41; this.f = this.m42;
            this.is2D = false;
          }
        }
      }
      multiply() { return this; }
      translate() { return this; }
      scale() { return this; }
      rotate() { return this; }
      inverse() { return this; }
      transformPoint(point: any) { return point || { x: 0, y: 0, z: 0, w: 1 }; }
      toFloat32Array() { return new Float32Array([this.m11, this.m12, this.m13, this.m14, this.m21, this.m22, this.m23, this.m24, this.m31, this.m32, this.m33, this.m34, this.m41, this.m42, this.m43, this.m44]); }
      toFloat64Array() { return new Float64Array([this.m11, this.m12, this.m13, this.m14, this.m21, this.m22, this.m23, this.m24, this.m31, this.m32, this.m33, this.m34, this.m41, this.m42, this.m43, this.m44]); }
    }
  }

  if (typeof globalThis.DOMPoint === "undefined") {
    // @ts-ignore
    globalThis.DOMPoint = class DOMPoint {
      x = 0; y = 0; z = 0; w = 1;
      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x; this.y = y; this.z = z; this.w = w;
      }
      matrixTransform() { return this; }
    }
  }

  if (typeof globalThis.Path2D === "undefined") {
    // @ts-ignore
    globalThis.Path2D = class Path2D {}
  }
}

async function extractOfficeText(file: StoredUploadFile, filePath: string) {
  const extension = path.extname(file.name).toLowerCase()
  const buffer = await readFile(filePath)

  if (extension === ".docx") {
    return (await mammoth.extractRawText({ buffer })).value
  }

  if (extension === ".pptx") {
    const zip = await JSZip.loadAsync(buffer)
    const slideNames = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((left, right) => Number(left.match(/slide(\d+)/)?.[1]) - Number(right.match(/slide(\d+)/)?.[1]))
    const slides: string[] = []
    for (const [index, slideName] of slideNames.entries()) {
      const slide = await parseStringPromise(await zip.files[slideName].async("string"))
      const values: string[] = []
      const collectText = (value: unknown): void => {
        if (typeof value === "string") values.push(value)
        else if (Array.isArray(value)) value.forEach(collectText)
        else if (value && typeof value === "object") Object.values(value).forEach(collectText)
      }
      collectText(slide["p:sld"])
      if (values.join(" ").trim()) slides.push(`Slide ${index + 1}: ${values.join(" ")}`)
    }
    return slides.join("\n\n")
  }

  if (extension === ".xlsx" || extension === ".xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" })
    return workbook.SheetNames.map((sheetName) => `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`).join("\n\n")
  }

  if (extension === ".pdf") {
    ensureNodeDomPolyfills()
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(`Page ${pageNumber}: ${content.items.map((item: any) => item.str || "").join(" ")}`)
    }
    return pages.join("\n\n")
  }

  return ""
}

async function addDocumentBatch(vectorStore: MemoryVectorStore, batch: Document[], job: RagIndexJob) {
  if (batch.length === 0) return
  await vectorStore.addDocuments(batch)
  job.chunkCount += batch.length
}

async function indexUploadedSession(job: RagIndexJob, session: UploadSession, apiKeyOverride?: string) {
  if (!hasRagApiKey(apiKeyOverride)) {
    throw new Error("NVIDIA_API_KEY is not set. Add it in Vercel Project Settings or enter it in the AI search settings.")
  }

  const vectorStore = new MemoryVectorStore(new NvidiaEmbeddings({ apiKey: apiKeyOverride }))
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: STREAM_CHUNK_SIZE, chunkOverlap: STREAM_CHUNK_OVERLAP })
  let chunkNumber = 0

  for (const file of session.files) {
    job.currentFile = file.relativePath
    const filePath = getStoredFilePath(session.id, file.storedName)
    const batch: Document[] = []
    const addChunk = async (content: string) => {
      chunkNumber += 1
      batch.push(new Document({
        pageContent: content,
        metadata: { documentId: file.id, name: file.name, path: file.relativePath, chunk: chunkNumber },
      }))
      if (batch.length >= EMBEDDING_BATCH_SIZE) {
        await addDocumentBatch(vectorStore, batch.splice(0, batch.length), job)
      }
    }

    if (isStreamableTextFile(file)) {
      for await (const content of streamTextChunks(filePath)) await addChunk(content)
    } else {
      const text = await extractOfficeText(file, filePath)
      const chunks = await splitter.splitText(text)
      for (const content of chunks) await addChunk(content)
    }

    await addDocumentBatch(vectorStore, batch, job)
    job.processedFiles += 1
    job.processedBytes += file.size
  }

  if (job.chunkCount === 0) {
    throw new Error("No readable text was found in the uploaded files.")
  }

  const indexId = randomUUID()
  corpora.set(indexId, {
    vectorStore,
    documentCount: session.files.length,
    chunkCount: job.chunkCount,
    createdAt: Date.now(),
  })
  job.indexId = indexId
  job.status = "complete"
  job.currentFile = undefined
}

export async function startUploadedIndex(uploadId: string, apiKeyOverride?: string): Promise<RagIndexJob> {
  removeExpiredCorpora()
  const existingJobId = uploadJobs.get(uploadId)
  if (existingJobId) {
    const existingJob = indexingJobs.get(existingJobId)
    if (existingJob) return existingJob
  }

  const session = await getUploadSession(uploadId)
  const job: RagIndexJob = {
    jobId: randomUUID(),
    uploadId,
    status: "indexing",
    totalBytes: session.totalBytes,
    processedBytes: 0,
    fileCount: session.files.length,
    processedFiles: 0,
    chunkCount: 0,
    createdAt: Date.now(),
  }
  indexingJobs.set(job.jobId, job)
  uploadJobs.set(uploadId, job.jobId)

  void indexUploadedSession(job, session, apiKeyOverride).catch((error) => {
    console.error("indexUploadedSession error:", error)
    job.status = "failed"
    job.error = error instanceof Error ? error.message : "Failed to index the uploaded files."
    job.currentFile = undefined
  })

  return job
}

export function getUploadedIndexJob(jobId: string) {
  removeExpiredCorpora()
  return indexingJobs.get(jobId)
}

export async function retrieveDocumentContext(indexId: string, question: string) {
  removeExpiredCorpora()

  if (!indexId || !corpora.has(indexId)) {
    const error = new Error("The document index is no longer available. Upload the documents again to rebuild it.")
    error.name = "RagIndexNotFoundError"
    throw error
  }

  const corpus = corpora.get(indexId)!
  const matches = await corpus.vectorStore.similaritySearchWithScore(question, 6)
  const sources: RagSource[] = matches.map(([document, score]) => ({
    documentId: String(document.metadata.documentId),
    name: String(document.metadata.name),
    path: document.metadata.path ? String(document.metadata.path) : undefined,
    chunk: Number(document.metadata.chunk),
    score: Number(score),
  }))

  const context = matches
    .map(([document], index) => `[S${index + 1}] ${document.metadata.name} (chunk ${document.metadata.chunk})\n${document.pageContent}`)
    .join("\n\n")

  return { context, sources }
}
