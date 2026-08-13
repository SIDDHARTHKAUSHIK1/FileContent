import { mkdir, readFile, rm, writeFile } from "fs/promises"
import path from "path"
import os from "os"

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(os.tmpdir(), "file-content-tracker-uploads")

export interface StoredUploadFile {
  id: string
  name: string
  relativePath: string
  storedName: string
  size: number
  mimeType: string
}

export interface UploadSession {
  id: string
  createdAt: string
  totalBytes: number
  files: StoredUploadFile[]
}

export function getUploadDirectory(uploadId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(uploadId)) {
    throw new Error("Invalid upload session.")
  }
  return path.join(UPLOAD_ROOT, uploadId)
}

export async function createUploadDirectory(uploadId: string) {
  const directory = getUploadDirectory(uploadId)
  await mkdir(directory, { recursive: true })
  return directory
}

export async function saveUploadSession(session: UploadSession) {
  const directory = getUploadDirectory(session.id)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(session), "utf8")
}

export async function getUploadSession(uploadId: string): Promise<UploadSession> {
  const directory = getUploadDirectory(uploadId)
  const manifest = await readFile(path.join(directory, "manifest.json"), "utf8")
  return JSON.parse(manifest) as UploadSession
}

export function getStoredFilePath(uploadId: string, storedName: string) {
  if (!/^[a-f0-9-]{36}(?:\.[a-z0-9]{1,12})?$/i.test(storedName)) {
    throw new Error("Invalid uploaded file.")
  }
  return path.join(getUploadDirectory(uploadId), storedName)
}

export async function removeUploadSession(uploadId: string) {
  await rm(getUploadDirectory(uploadId), { recursive: true, force: true })
}
