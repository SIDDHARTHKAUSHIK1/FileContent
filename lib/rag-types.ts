export interface RagDocumentInput {
  id: string
  name: string
  content: string
  path?: string
}

export interface RagSource {
  documentId: string
  name: string
  path?: string
  chunk: number
  score: number
}
