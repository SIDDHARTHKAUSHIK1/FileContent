export interface RagDocumentInput {
  id: string
  name: string
  content: string
  path?: string
  type?: string
}

export interface RagSource {
  id?: string
  documentId: string
  name: string
  path?: string
  chunk: number
  score: number
  snippet?: string
}
