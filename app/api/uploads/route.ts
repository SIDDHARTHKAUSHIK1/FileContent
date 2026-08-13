import Busboy from "busboy"
import { createWriteStream } from "fs"
import { rm } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import { NextRequest, NextResponse } from "next/server"
import {
  createUploadDirectory,
  MAX_UPLOAD_BYTES,
  saveUploadSession,
  type StoredUploadFile,
  type UploadSession,
} from "@/lib/upload-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILES = 500

function safeRelativePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/").replace(/^\/+/, "")
  const segments = normalized.split("/").filter((segment) => segment && segment !== "." && segment !== "..")
  return segments.join("/") || "uploaded-file"
}

function storedFileName() {
  return randomUUID()
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type")
  if (!contentType?.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Use multipart/form-data to upload files." }, { status: 415 })
  }

  if (!request.body) {
    return NextResponse.json({ error: "The upload request has no body." }, { status: 400 })
  }

  const uploadId = randomUUID()
  let uploadDirectory = ""
  let totalBytes = 0
  let uploadError: Error | null = null
  const files: StoredUploadFile[] = []
  const writes: Promise<void>[] = []

  try {
    uploadDirectory = await createUploadDirectory(uploadId)
    const input = Readable.fromWeb(request.body as unknown as import("stream/web").ReadableStream)
    const parser = Busboy({
      headers: { "content-type": contentType },
      limits: { files: MAX_FILES, fileSize: MAX_UPLOAD_BYTES },
    })

    const failUpload = (error: Error) => {
      if (!uploadError) {
        uploadError = error
        input.destroy(error)
      }
    }

    parser.on("file", (fieldName, file, info) => {
      if (fieldName !== "files") {
        file.resume()
        return
      }

      if (files.length >= MAX_FILES) {
        failUpload(new Error(`A maximum of ${MAX_FILES} files can be uploaded at once.`))
        file.resume()
        return
      }

      const relativePath = safeRelativePath(info.filename)
      const extension = path.extname(relativePath).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 13)
      const storedName = `${storedFileName()}${extension}`
      const storedFile: StoredUploadFile = {
        id: randomUUID(),
        name: path.posix.basename(relativePath),
        relativePath,
        storedName,
        size: 0,
        mimeType: info.mimeType || "application/octet-stream",
      }
      files.push(storedFile)

      file.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length
        storedFile.size += chunk.length
        if (totalBytes > MAX_UPLOAD_BYTES) {
          failUpload(new Error("Uploads are limited to 500 MB in total."))
        }
      })
      file.on("limit", () => failUpload(new Error("A single file exceeds the 500 MB upload limit.")))

      writes.push(pipeline(file, createWriteStream(path.join(uploadDirectory, storedName))))
    })

    parser.on("filesLimit", () => failUpload(new Error(`A maximum of ${MAX_FILES} files can be uploaded at once.`)))

    await new Promise<void>((resolve, reject) => {
      input.once("error", reject)
      parser.once("error", reject)
      parser.once("finish", resolve)
      input.pipe(parser)
    })
    await Promise.all(writes)

    if (uploadError) throw uploadError
    if (files.length === 0) throw new Error("Choose at least one file to upload.")

    const session: UploadSession = {
      id: uploadId,
      createdAt: new Date().toISOString(),
      totalBytes,
      files,
    }
    await saveUploadSession(session)

    return NextResponse.json({
      uploadId: session.id,
      fileCount: session.files.length,
      totalBytes: session.totalBytes,
    })
  } catch (error) {
    if (uploadDirectory) await rm(uploadDirectory, { recursive: true, force: true })
    const message = error instanceof Error ? error.message : "Upload failed."
    const status = message.includes("500 MB") ? 413 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
