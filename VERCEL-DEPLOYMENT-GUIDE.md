# Deploying the document AI app to Vercel

The app uses NVIDIA NIM for its LangChain RAG pipeline: NVIDIA embeddings retrieve relevant uploaded-document chunks and Nemotron generates a cited answer from those chunks only.

## Configure NVIDIA credentials

1. In your Vercel project, open **Settings → Environment Variables**.
2. Add `NVIDIA_API_KEY` with your NVIDIA Build API key.
3. Optionally add these values (the app defaults to them already):

   ```env
   NVIDIA_API_BASE_URL=https://integrate.api.nvidia.com/v1
   NVIDIA_CHAT_MODEL=nvidia/nemotron-3-ultra-550b-a55b
   NVIDIA_EMBEDDING_MODEL=nvidia/nv-embedqa-e5-v5
   ```

4. Redeploy the project.

## Important RAG storage note

The current RAG index is intentionally in memory and is ideal for local use. Vercel functions may use separate instances, so a production Vercel deployment should replace the in-memory vector store with persistent storage such as Pinecone, Qdrant, or PostgreSQL with pgvector.

Vercel is also not the right host for this app's 500 MB local upload path. Use direct browser uploads to object storage (for example S3, R2, or Blob storage), then send the stored file reference to a background indexing worker.
